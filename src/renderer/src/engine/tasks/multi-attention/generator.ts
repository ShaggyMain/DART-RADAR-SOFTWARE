import { mutateGlyph, randomGlyph, type Glyph } from '@shared/glyphs'
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
 * Multi Attention — three concurrent streams under one clock:
 *  (a) shape pairs: press the MATCH key when the two figures are identical
 *  (b) equations:   answer every equation TRUE or FALSE
 *  (c) sound cues:  press the SOUND key when a beep plays (difficulty ≥ 2)
 */
export interface ShapeStim {
  tMs: number
  durationMs: number
  left: Glyph
  right: Glyph
  match: boolean
}

export interface EquationStim {
  tMs: number
  durationMs: number
  text: string
  isTrue: boolean
}

export interface BeepStim {
  tMs: number
}

export interface MultiAttentionScenario extends ScenarioBase {
  taskId: 'multi-attention'
  shapes: ShapeStim[]
  equations: EquationStim[]
  beeps: BeepStim[]
  beepWindowMs: number
  durationMs: number
}

export type MAKey = 'match' | 'true' | 'false' | 'beep'

export interface MAEvent {
  tMs: number
  key: MAKey
}

interface Config {
  durationMs: number
  shapeIntervalMs: number
  equationIntervalMs: number
  beeps: boolean
  glyphSize: number
  glyphFill: number
  matchProbability: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { durationMs: 60_000, shapeIntervalMs: 3000, equationIntervalMs: 5000, beeps: false, glyphSize: 4, glyphFill: 6, matchProbability: 0.35 },
  2: { durationMs: 75_000, shapeIntervalMs: 2700, equationIntervalMs: 4500, beeps: true, glyphSize: 4, glyphFill: 6, matchProbability: 0.35 },
  3: { durationMs: 90_000, shapeIntervalMs: 2400, equationIntervalMs: 4000, beeps: true, glyphSize: 5, glyphFill: 9, matchProbability: 0.35 },
  4: { durationMs: 105_000, shapeIntervalMs: 2100, equationIntervalMs: 3500, beeps: true, glyphSize: 5, glyphFill: 9, matchProbability: 0.4 },
  5: { durationMs: 120_000, shapeIntervalMs: 1800, equationIntervalMs: 3000, beeps: true, glyphSize: 5, glyphFill: 10, matchProbability: 0.4 }
}

export const BEEP_WINDOW_MS = 1600

export function generate(seed: string, difficulty: Difficulty): MultiAttentionScenario {
  const rng = new Rng(`multi-attention:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]

  const shapes: ShapeStim[] = []
  for (let t = 1000; t + cfg.shapeIntervalMs <= cfg.durationMs; t += cfg.shapeIntervalMs) {
    const left = randomGlyph(rng, cfg.glyphSize, cfg.glyphFill)
    const match = rng.bool(cfg.matchProbability)
    const right = match
      ? { size: left.size, cells: left.cells.slice() }
      : mutateGlyph(rng, left, rng.int(1, 2))
    shapes.push({ tMs: t, durationMs: cfg.shapeIntervalMs, left, right, match })
  }

  const equations: EquationStim[] = []
  for (let t = 1500; t + cfg.equationIntervalMs <= cfg.durationMs; t += cfg.equationIntervalMs) {
    const a = rng.int(11, 79)
    const b = rng.int(11, 79)
    const add = rng.bool()
    const [x, y] = add || a >= b ? [a, b] : [b, a]
    const trueResult = add ? x + y : x - y
    const isTrue = rng.bool()
    let shown = trueResult
    if (!isTrue) {
      const delta = rng.int(1, 9) * (rng.bool() ? 1 : -1)
      shown = Math.max(0, trueResult + delta)
      if (shown === trueResult) shown = trueResult + 1
    }
    equations.push({
      tMs: t,
      durationMs: cfg.equationIntervalMs,
      text: `${x} ${add ? '+' : '−'} ${y} = ${shown}`,
      isTrue
    })
  }

  const beeps: BeepStim[] = []
  if (cfg.beeps) {
    let t = rng.float(5000, 10_000)
    while (t < cfg.durationMs - BEEP_WINDOW_MS) {
      beeps.push({ tMs: t })
      t += rng.float(7000, 15_000)
    }
  }

  return {
    taskId: 'multi-attention',
    seed,
    difficulty,
    shapes,
    equations,
    beeps,
    beepWindowMs: BEEP_WINDOW_MS,
    durationMs: cfg.durationMs
  }
}

/**
 * Pure scorer. Items are ordered: all shape stimuli, then all equations,
 * then all beeps (the per-stream accuracies are also reported as extras).
 */
export function score(scenario: MultiAttentionScenario, events: MAEvent[]): TaskResult {
  const sorted = events.slice().sort((a, b) => a.tMs - b.tMs)

  let index = 0
  const items: ItemOutcome[] = []

  // (a) shapes: a 'match' press during the stimulus window counts as
  // "said match"; correctness = (saidMatch === isMatch). Non-match pairs
  // are correct-rejections when no key was pressed.
  let shapeCorrect = 0
  for (const stim of scenario.shapes) {
    const press = sorted.find(
      (e) => e.key === 'match' && e.tMs >= stim.tMs && e.tMs < stim.tMs + stim.durationMs
    )
    const correct = press ? stim.match : !stim.match
    if (correct) shapeCorrect++
    items.push({
      index: index++,
      correct,
      rtMs: press ? press.tMs - stim.tMs : 0,
      timedOut: false
    })
  }

  // (b) equations: forced choice; first true/false press in the window.
  let mathCorrect = 0
  for (const stim of scenario.equations) {
    const press = sorted.find(
      (e) =>
        (e.key === 'true' || e.key === 'false') &&
        e.tMs >= stim.tMs &&
        e.tMs < stim.tMs + stim.durationMs
    )
    if (!press) {
      items.push({ index: index++, correct: false, rtMs: 0, timedOut: true })
      continue
    }
    const correct = (press.key === 'true') === stim.isTrue
    if (correct) mathCorrect++
    items.push({ index: index++, correct, rtMs: press.tMs - stim.tMs, timedOut: false })
  }

  // (c) beeps: press within the window; unmatched beep presses = false alarms.
  const usedBeepPress = new Set<number>()
  let beepCorrect = 0
  for (const stim of scenario.beeps) {
    let hit: MAEvent | undefined
    for (let p = 0; p < sorted.length; p++) {
      if (usedBeepPress.has(p) || sorted[p].key !== 'beep') continue
      const dt = sorted[p].tMs - stim.tMs
      if (dt >= 0 && dt <= scenario.beepWindowMs) {
        usedBeepPress.add(p)
        hit = sorted[p]
        break
      }
    }
    if (hit) beepCorrect++
    items.push({
      index: index++,
      correct: !!hit,
      rtMs: hit ? hit.tMs - stim.tMs : 0,
      timedOut: !hit
    })
  }
  const beepFalseAlarms = sorted.filter((e, p) => e.key === 'beep' && !usedBeepPress.has(p)).length

  const extra: Record<string, number> = {
    shapeAccuracy: scenario.shapes.length === 0 ? 0 : shapeCorrect / scenario.shapes.length,
    mathAccuracy: scenario.equations.length === 0 ? 0 : mathCorrect / scenario.equations.length
  }
  if (scenario.beeps.length > 0) {
    extra.soundAccuracy = beepCorrect / scenario.beeps.length
    extra.falseAlarms = beepFalseAlarms
  }
  return buildResult(scenario.taskId, items, extra)
}

export const multiAttentionLogic: TaskLogic<MultiAttentionScenario, MAEvent[]> = {
  taskId: 'multi-attention',
  generate,
  score
}
