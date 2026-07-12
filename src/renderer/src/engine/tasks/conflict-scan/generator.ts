import { distance, headingDeg, normalizeHeading } from '@shared/geometry'
import { Rng } from '@shared/rng'
import { scoreMultipleChoice } from '@shared/scoring'
import type {
  Difficulty,
  ItemResponse,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * Conflict Scan — collision detection under time pressure. A field of
 * triangles (aircraft) is shown briefly; decide whether any two point
 * DIRECTLY AT EACH OTHER (strict head-on — proximity alone is not a
 * conflict). Near-miss decoys punish shallow scanning.
 */
export interface ConflictAircraft {
  x: number
  y: number
  headingDeg: number
}

export interface ConflictItem {
  aircraft: ConflictAircraft[]
  /** Ground truth: does a head-on pair exist? */
  conflict: boolean
  /** Tolerance used for the ground truth, degrees. */
  toleranceDeg: number
  exposureMs: number
  /** Total answer time from stimulus onset (exposure included). */
  timeLimitMs: number
  correctIndex: number
}

export interface ConflictScanScenario extends ScenarioBase {
  taskId: 'conflict-scan'
  items: ConflictItem[]
}

/** Fixed answer options: index 0 = Conflict, 1 = No conflict. */
export const CONFLICT_OPTIONS = ['Conflict', 'No conflict'] as const

const FIELD = 100
const MIN_SEPARATION = 16

interface Config {
  items: number
  aircraft: number
  toleranceDeg: number
  exposureMs: number
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 10, aircraft: 5, toleranceDeg: 8, exposureMs: 7000, timeLimitMs: 12000 },
  2: { items: 12, aircraft: 7, toleranceDeg: 7, exposureMs: 5500, timeLimitMs: 10000 },
  3: { items: 12, aircraft: 9, toleranceDeg: 6, exposureMs: 4500, timeLimitMs: 9000 },
  4: { items: 14, aircraft: 11, toleranceDeg: 5, exposureMs: 3500, timeLimitMs: 8000 },
  5: { items: 14, aircraft: 13, toleranceDeg: 5, exposureMs: 2500, timeLimitMs: 7000 }
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(normalizeHeading(a) - normalizeHeading(b))
  return Math.min(d, 360 - d)
}

/** True when aircraft i and j point directly at each other (within tol). */
function isHeadOnPair(a: ConflictAircraft, b: ConflictAircraft, tolDeg: number): boolean {
  return (
    angularDiff(a.headingDeg, headingDeg(a, b)) <= tolDeg &&
    angularDiff(b.headingDeg, headingDeg(b, a)) <= tolDeg
  )
}

/** Exhaustive ground-truth check, shared with the tests. */
export function hasHeadOnConflict(aircraft: ConflictAircraft[], tolDeg: number): boolean {
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      if (isHeadOnPair(aircraft[i], aircraft[j], tolDeg)) return true
    }
  }
  return false
}

/**
 * Screen projection shared with the View. Generators work in math coordinates
 * (x east, y north / UP), but SVG's y axis points down. The View renders each
 * heading as `rotate(headingDeg)` of an up-pointing glyph — a north-up compass
 * convention — so the positions must be y-flipped to match. Flipping only the
 * positions (or only the headings) mirrors every head-on pair vertically, which
 * makes real conflicts render pointing apart and vice versa.
 */
export function toScreen(a: { x: number; y: number }): { x: number; y: number } {
  return { x: a.x, y: FIELD - a.y }
}

/** Screen-space (y-down) unit vector a glyph points along at a compass heading. */
export function headingUnit(headingDeg: number): { x: number; y: number } {
  const r = (headingDeg * Math.PI) / 180
  return { x: Math.sin(r), y: -Math.cos(r) }
}

function placePositions(rng: Rng, count: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  let guard = 0
  while (pts.length < count) {
    if (++guard > 2000) throw new Error('conflict-scan: cannot place aircraft')
    const p = { x: rng.float(8, FIELD - 8), y: rng.float(8, FIELD - 8) }
    if (pts.every((q) => distance(p, q) >= MIN_SEPARATION)) pts.push(p)
  }
  return pts
}

function makeItem(rng: Rng, cfg: Config, conflict: boolean): ConflictItem {
  let guard = 0
  while (true) {
    if (++guard > 200) throw new Error('conflict-scan: item generation failed')
    const positions = placePositions(rng, cfg.aircraft)
    const aircraft: ConflictAircraft[] = positions.map((p) => ({
      ...p,
      headingDeg: rng.float(0, 360)
    }))

    if (conflict) {
      // Designate one head-on pair with a small jitter well inside tolerance.
      const [i, j] = rng.sample(
        Array.from({ length: aircraft.length }, (_, k) => k),
        2
      )
      const jitter = (): number => rng.float(-cfg.toleranceDeg / 3, cfg.toleranceDeg / 3)
      aircraft[i].headingDeg = normalizeHeading(headingDeg(aircraft[i], aircraft[j]) + jitter())
      aircraft[j].headingDeg = normalizeHeading(headingDeg(aircraft[j], aircraft[i]) + jitter())
    } else {
      // Near-miss decoys: a one-way pointer, and a reciprocal pair offset
      // clearly outside tolerance (2.5–4x) so the truth stays unambiguous.
      const [i, j, k] = rng.sample(
        Array.from({ length: aircraft.length }, (_, n) => n),
        3
      )
      aircraft[i].headingDeg = normalizeHeading(headingDeg(aircraft[i], aircraft[j]))
      const off = (): number =>
        rng.float(cfg.toleranceDeg * 2.5, cfg.toleranceDeg * 4) * (rng.bool() ? 1 : -1)
      aircraft[j].headingDeg = normalizeHeading(headingDeg(aircraft[j], aircraft[k]) + off())
      aircraft[k].headingDeg = normalizeHeading(headingDeg(aircraft[k], aircraft[j]) + off())
    }

    // Use a stricter check for "no conflict" (2x tolerance margin) so that
    // borderline accidental pairs never make the answer debatable.
    const truthNow = hasHeadOnConflict(aircraft, cfg.toleranceDeg)
    const marginOk = conflict || !hasHeadOnConflict(aircraft, cfg.toleranceDeg * 2)
    if (truthNow === conflict && marginOk) {
      return {
        aircraft,
        conflict,
        toleranceDeg: cfg.toleranceDeg,
        exposureMs: cfg.exposureMs,
        timeLimitMs: cfg.timeLimitMs,
        correctIndex: conflict ? 0 : 1
      }
    }
  }
}

export function generate(seed: string, difficulty: Difficulty): ConflictScanScenario {
  const rng = new Rng(`conflict-scan:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  // Half conflicts, half not, shuffled.
  const truths = rng.shuffle(
    Array.from({ length: cfg.items }, (_, i) => i < Math.ceil(cfg.items / 2))
  )
  return {
    taskId: 'conflict-scan',
    seed,
    difficulty,
    items: truths.map((t) => makeItem(rng, cfg, t))
  }
}

export function score(scenario: ConflictScanScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const conflictScanLogic: TaskLogic<ConflictScanScenario, ItemResponse[]> = {
  taskId: 'conflict-scan',
  generate,
  score
}
