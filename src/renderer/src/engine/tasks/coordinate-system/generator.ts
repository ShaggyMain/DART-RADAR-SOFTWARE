import { distance, headingDeg, normalizeHeading, signedTurn, type Point } from '@shared/geometry'
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
 * Coordinate System — distance, heading and turn estimation on a grid.
 * Three sub-tasks rotate through the item list:
 *  - distance: straight-line distance between two plotted points
 *  - heading:  compass bearing from A to B
 *  - rotation: signed turn from a current course onto the course to B
 */
export type CoordKind = 'distance' | 'heading' | 'rotation'

export interface CoordItem {
  kind: CoordKind
  a: Point
  b: Point
  /** Only used by 'rotation' items: current course in degrees. */
  currentHeading: number | null
  /** Numeric ground truth (grid units, degrees, or signed turn degrees). */
  answerValue: number
  options: string[]
  correctIndex: number
  timeLimitMs: number
  gridSize: number
}

export interface CoordScenario extends ScenarioBase {
  taskId: 'coordinate-system'
  items: CoordItem[]
}

interface Config {
  items: number
  gridSize: number
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 9, gridSize: 10, timeLimitMs: 20000 },
  2: { items: 12, gridSize: 12, timeLimitMs: 17000 },
  3: { items: 12, gridSize: 12, timeLimitMs: 14000 },
  4: { items: 15, gridSize: 14, timeLimitMs: 12000 },
  5: { items: 15, gridSize: 14, timeLimitMs: 10000 }
}

export function formatDistance(v: number): string {
  return v.toFixed(1)
}

export function formatHeading(deg: number): string {
  return `${String(Math.round(normalizeHeading(deg))).padStart(3, '0')}°`
}

export function formatTurn(turn: number): string {
  return `${turn > 0 ? 'Right' : 'Left'} ${Math.abs(Math.round(turn))}°`
}

function twoDistinctPoints(rng: Rng, gridSize: number, minDist: number): [Point, Point] {
  for (let i = 0; i < 200; i++) {
    const a = { x: rng.int(0, gridSize), y: rng.int(0, gridSize) }
    const b = { x: rng.int(0, gridSize), y: rng.int(0, gridSize) }
    if (distance(a, b) >= minDist) return [a, b]
  }
  return [
    { x: 0, y: 0 },
    { x: gridSize, y: gridSize }
  ]
}

function distanceItem(rng: Rng, cfg: Config): CoordItem {
  const [a, b] = twoDistinctPoints(rng, cfg.gridSize, 3)
  const answer = Math.round(distance(a, b) * 10) / 10
  const options = new Set<string>([formatDistance(answer)])
  let guard = 0
  while (options.size < 4 && ++guard < 200) {
    const sign = rng.bool() ? 1 : -1
    const off = rng.float(0.8, 2.6) * sign
    const v = Math.round((answer + off) * 10) / 10
    if (v <= 0) continue
    // keep distractors visually distinct
    if ([...options].some((o) => Math.abs(parseFloat(o) - v) < 0.7)) continue
    options.add(formatDistance(v))
  }
  const shuffled = rng.shuffle([...options])
  return {
    kind: 'distance',
    a,
    b,
    currentHeading: null,
    answerValue: answer,
    options: shuffled,
    correctIndex: shuffled.indexOf(formatDistance(answer)),
    timeLimitMs: cfg.timeLimitMs,
    gridSize: cfg.gridSize
  }
}

function circularGapOk(existing: number[], v: number, minGap: number): boolean {
  return existing.every((e) => {
    const d = Math.abs(normalizeHeading(e) - normalizeHeading(v))
    return Math.min(d, 360 - d) >= minGap
  })
}

function headingItem(rng: Rng, cfg: Config): CoordItem {
  const [a, b] = twoDistinctPoints(rng, cfg.gridSize, 3)
  const answer = Math.round(headingDeg(a, b))
  const values = [answer]
  // Classic traps: reciprocal heading and mirrored bearing.
  for (const cand of [answer + 180, 360 - answer]) {
    if (values.length < 4 && circularGapOk(values, cand, 15)) values.push(Math.round(normalizeHeading(cand)))
  }
  let guard = 0
  while (values.length < 4 && ++guard < 200) {
    const cand = normalizeHeading(answer + (rng.bool() ? 1 : -1) * rng.int(20, 70))
    if (circularGapOk(values, cand, 15)) values.push(Math.round(cand))
  }
  const shuffled = rng.shuffle(values.map(formatHeading))
  return {
    kind: 'heading',
    a,
    b,
    currentHeading: null,
    answerValue: answer,
    options: shuffled,
    correctIndex: shuffled.indexOf(formatHeading(answer)),
    timeLimitMs: cfg.timeLimitMs,
    gridSize: cfg.gridSize
  }
}

function rotationItem(rng: Rng, cfg: Config): CoordItem {
  let a: Point, b: Point, turn: number, current: number
  let guard = 0
  do {
    ;[a, b] = twoDistinctPoints(rng, cfg.gridSize, 3)
    current = rng.int(0, 35) * 10
    turn = Math.round(signedTurn(current, headingDeg(a, b)))
    // avoid ambiguous no-turn / exact-reversal cases
  } while ((Math.abs(turn) < 10 || Math.abs(turn) > 170) && ++guard < 300)
  if (Math.abs(turn) < 10 || Math.abs(turn) > 170) {
    // deterministic fallback that always satisfies the constraint
    a = { x: 0, y: 0 }
    b = { x: cfg.gridSize, y: 0 }
    current = 0
    turn = 90
  }

  const texts = new Set<string>([formatTurn(turn)])
  texts.add(formatTurn(-turn)) // opposite direction, same magnitude
  let g2 = 0
  while (texts.size < 4 && ++g2 < 200) {
    const magnitude = Math.abs(turn) + (rng.bool() ? 1 : -1) * rng.int(20, 60)
    if (magnitude < 10 || magnitude > 170) continue
    texts.add(formatTurn(rng.bool() ? magnitude : -magnitude))
  }
  const shuffled = rng.shuffle([...texts])
  return {
    kind: 'rotation',
    a,
    b,
    currentHeading: current,
    answerValue: turn,
    options: shuffled,
    correctIndex: shuffled.indexOf(formatTurn(turn)),
    timeLimitMs: cfg.timeLimitMs,
    gridSize: cfg.gridSize
  }
}

const KINDS: readonly CoordKind[] = ['distance', 'heading', 'rotation']

export function generate(seed: string, difficulty: Difficulty): CoordScenario {
  const rng = new Rng(`coordinate-system:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const items: CoordItem[] = []
  for (let i = 0; i < cfg.items; i++) {
    const kind = KINDS[i % KINDS.length]
    if (kind === 'distance') items.push(distanceItem(rng, cfg))
    else if (kind === 'heading') items.push(headingItem(rng, cfg))
    else items.push(rotationItem(rng, cfg))
  }
  return { taskId: 'coordinate-system', seed, difficulty, items: rng.shuffle(items) }
}

export function score(scenario: CoordScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const coordinateSystemLogic: TaskLogic<CoordScenario, ItemResponse[]> = {
  taskId: 'coordinate-system',
  generate,
  score
}
