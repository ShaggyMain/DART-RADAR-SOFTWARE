import { Rng } from '@shared/rng'
import { buildResult } from '@shared/scoring'
import type {
  Difficulty,
  ItemOutcome,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * Vigilance — sustained single-signal detection. A marker steps around a
 * ring of positions at a steady rhythm; occasionally it makes an irregular
 * DOUBLE step. Press the response key the instant a double step happens.
 * False alarms are penalised in the report.
 */
export interface VigilanceScenario extends ScenarioBase {
  taskId: 'vigilance'
  /** Number of positions on the ring. */
  positions: number
  stepIntervalMs: number
  /** Per step: true = irregular double step. Index 0 fires at t = interval. */
  steps: boolean[]
  responseWindowMs: number
  durationMs: number
}

/** Timestamped response-key presses relative to run start. */
export interface PressEvent {
  tMs: number
}

interface Config {
  positions: number
  stepIntervalMs: number
  durationMs: number
  jumpCount: number
  /** Minimum regular steps between jumps. */
  minGapSteps: number
  responseWindowMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { positions: 12, stepIntervalMs: 900, durationMs: 90_000, jumpCount: 8, minGapSteps: 4, responseWindowMs: 1500 },
  2: { positions: 14, stepIntervalMs: 800, durationMs: 105_000, jumpCount: 10, minGapSteps: 4, responseWindowMs: 1400 },
  3: { positions: 16, stepIntervalMs: 750, durationMs: 120_000, jumpCount: 12, minGapSteps: 3, responseWindowMs: 1300 },
  4: { positions: 16, stepIntervalMs: 650, durationMs: 135_000, jumpCount: 14, minGapSteps: 3, responseWindowMs: 1200 },
  5: { positions: 18, stepIntervalMs: 550, durationMs: 150_000, jumpCount: 16, minGapSteps: 3, responseWindowMs: 1100 }
}

export function generate(seed: string, difficulty: Difficulty): VigilanceScenario {
  const rng = new Rng(`vigilance:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const stepCount = Math.floor(cfg.durationMs / cfg.stepIntervalMs)
  const steps = new Array<boolean>(stepCount).fill(false)

  // Place jumps with a minimum gap; never in the first few steps.
  const candidates: number[] = []
  for (let i = 3; i < stepCount - 1; i++) candidates.push(i)
  let placed = 0
  let guard = 0
  const jumpAt = new Set<number>()
  while (placed < cfg.jumpCount && guard++ < 5000 && candidates.length > 0) {
    const idx = rng.pick(candidates)
    let ok = true
    for (let d = -cfg.minGapSteps; d <= cfg.minGapSteps; d++) {
      if (jumpAt.has(idx + d)) {
        ok = false
        break
      }
    }
    if (ok) {
      jumpAt.add(idx)
      steps[idx] = true
      placed++
    }
  }

  return {
    taskId: 'vigilance',
    seed,
    difficulty,
    positions: cfg.positions,
    stepIntervalMs: cfg.stepIntervalMs,
    steps,
    responseWindowMs: cfg.responseWindowMs,
    durationMs: stepCount * cfg.stepIntervalMs
  }
}

/** Times (ms from start) at which irregular double steps occur. */
export function jumpTimes(scenario: VigilanceScenario): number[] {
  const times: number[] = []
  scenario.steps.forEach((jump, i) => {
    if (jump) times.push((i + 1) * scenario.stepIntervalMs)
  })
  return times
}

/**
 * Pure scorer over timestamped presses: each jump is hit by the first press
 * inside its response window; every unmatched press is a false alarm.
 */
export function score(scenario: VigilanceScenario, presses: PressEvent[]): TaskResult {
  const jumps = jumpTimes(scenario)
  const sorted = presses.slice().sort((a, b) => a.tMs - b.tMs)
  const usedPress = new Array<boolean>(sorted.length).fill(false)

  const items: ItemOutcome[] = jumps.map((tJump, index) => {
    for (let p = 0; p < sorted.length; p++) {
      if (usedPress[p]) continue
      const dt = sorted[p].tMs - tJump
      if (dt >= 0 && dt <= scenario.responseWindowMs) {
        usedPress[p] = true
        return { index, correct: true, rtMs: dt, timedOut: false }
      }
      if (sorted[p].tMs > tJump + scenario.responseWindowMs) break
    }
    return { index, correct: false, rtMs: 0, timedOut: true }
  })

  const falseAlarms = usedPress.filter((u) => !u).length
  return buildResult(scenario.taskId, items, { falseAlarms })
}

export const vigilanceLogic: TaskLogic<VigilanceScenario, PressEvent[]> = {
  taskId: 'vigilance',
  generate,
  score
}
