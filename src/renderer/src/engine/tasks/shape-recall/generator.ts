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
 * Shape Recall — recognition memory with an interference gap. Each round:
 *
 *   1. STUDY  — compound shapes are shown one after another.
 *   2. CALC   — a few simple sums, so the shapes cannot be rehearsed.
 *   3. RECALL — the studied shapes must be picked out of a grid that also
 *               holds near-miss distractors (one feature changed).
 *
 * The figures are built from four independent features, so distractors can
 * differ by exactly one of them. All shapes are generated here and drawn by
 * the view.
 */
export type RecallOuter = 'circle' | 'square'
export type RecallDiagonal = 'none' | 'tlbr' | 'trbl'
export type RecallChord = 'none' | 'top' | 'bottom'

/** Dot positions inside the figure: 0 = top, 1 = right, 2 = bottom, 3 = left. */
export const DOT_SLOTS = [0, 1, 2, 3] as const

export interface RecallShape {
  outer: RecallOuter
  diagonal: RecallDiagonal
  chord: RecallChord
  /** Ascending slot indices; one or two dots. */
  dots: number[]
}

export interface CalcQuestion {
  text: string
  options: number[]
  correctIndex: number
}

export interface GridCell {
  shape: RecallShape
  /** True when this shape was in the study list for the round. */
  target: boolean
}

export interface RecallRound {
  study: RecallShape[]
  /** How long each studied shape stays on screen. */
  studyMs: number
  calcs: CalcQuestion[]
  calcTimeLimitMs: number
  grid: GridCell[]
  gridTimeLimitMs: number
}

export interface ShapeRecallScenario extends ScenarioBase {
  taskId: 'shape-recall'
  rounds: RecallRound[]
}

/** One recorded answer; the view emits these as the round plays out. */
export type RecallAnswer =
  | { type: 'calc'; round: number; index: number; answerIndex: number | null; rtMs: number }
  | { type: 'grid'; round: number; index: number; selected: boolean; rtMs: number }

export function shapeKey(shape: RecallShape): string {
  return `${shape.outer}|${shape.diagonal}|${shape.chord}|${shape.dots.join(',')}`
}

export function sameShape(a: RecallShape, b: RecallShape): boolean {
  return shapeKey(a) === shapeKey(b)
}

const OUTERS: readonly RecallOuter[] = ['circle', 'square']
const DIAGONALS: readonly RecallDiagonal[] = ['none', 'tlbr', 'trbl']
const CHORDS: readonly RecallChord[] = ['none', 'top', 'bottom']

function randomDots(rng: Rng): number[] {
  return rng.sample(DOT_SLOTS, rng.int(1, 2)).sort((a, b) => a - b)
}

function randomShape(rng: Rng): RecallShape {
  return {
    outer: rng.pick(OUTERS),
    diagonal: rng.pick(DIAGONALS),
    chord: rng.pick(CHORDS),
    dots: randomDots(rng)
  }
}

/** A near miss: the same figure with exactly one feature changed. */
export function mutateShape(rng: Rng, shape: RecallShape): RecallShape {
  for (let guard = 0; guard < 50; guard++) {
    const next: RecallShape = { ...shape, dots: [...shape.dots] }
    switch (rng.int(0, 3)) {
      case 0:
        next.outer = rng.pick(OUTERS.filter((o) => o !== shape.outer))
        break
      case 1:
        next.diagonal = rng.pick(DIAGONALS.filter((d) => d !== shape.diagonal))
        break
      case 2:
        next.chord = rng.pick(CHORDS.filter((c) => c !== shape.chord))
        break
      default:
        next.dots = randomDots(rng)
    }
    if (!sameShape(next, shape)) return next
  }
  throw new Error('shape-recall: could not mutate the shape')
}

interface Config {
  rounds: number
  study: number
  studyMs: number
  calcs: number
  gridSize: number
  calcTimeLimitMs: number
  gridTimeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { rounds: 3, study: 3, studyMs: 1500, calcs: 2, gridSize: 6, calcTimeLimitMs: 9000, gridTimeLimitMs: 20000 },
  2: { rounds: 3, study: 4, studyMs: 1400, calcs: 2, gridSize: 8, calcTimeLimitMs: 8000, gridTimeLimitMs: 20000 },
  3: { rounds: 4, study: 4, studyMs: 1300, calcs: 3, gridSize: 8, calcTimeLimitMs: 8000, gridTimeLimitMs: 18000 },
  4: { rounds: 4, study: 5, studyMs: 1150, calcs: 3, gridSize: 10, calcTimeLimitMs: 7000, gridTimeLimitMs: 18000 },
  5: { rounds: 4, study: 6, studyMs: 1000, calcs: 4, gridSize: 12, calcTimeLimitMs: 6000, gridTimeLimitMs: 16000 }
}

function makeCalc(rng: Rng): CalcQuestion {
  const a = rng.int(6, 39)
  const b = rng.int(3, 19)
  const add = rng.bool()
  const answer = add ? a + b : a - b
  const options = new Set<number>([answer])
  let guard = 0
  while (options.size < 4 && ++guard < 200) {
    const delta = rng.int(1, 6) * (rng.bool() ? 1 : -1)
    const v = answer + delta
    if (v >= 0) options.add(v)
  }
  let k = 7
  while (options.size < 4) options.add(answer + k++)
  const shuffled = rng.shuffle([...options])
  return {
    text: `${a} ${add ? '+' : '−'} ${b}`,
    options: shuffled,
    correctIndex: shuffled.indexOf(answer)
  }
}

function makeRound(rng: Rng, cfg: Config): RecallRound {
  const study: RecallShape[] = []
  const seen = new Set<string>()
  let guard = 0
  while (study.length < cfg.study && ++guard < 500) {
    const s = randomShape(rng)
    if (seen.has(shapeKey(s))) continue
    seen.add(shapeKey(s))
    study.push(s)
  }

  const distractors: RecallShape[] = []
  guard = 0
  while (distractors.length < cfg.gridSize - cfg.study && ++guard < 500) {
    // mostly near misses of a studied shape, sometimes a fresh figure
    const s = rng.bool(0.7) ? mutateShape(rng, rng.pick(study)) : randomShape(rng)
    if (seen.has(shapeKey(s))) continue
    seen.add(shapeKey(s))
    distractors.push(s)
  }

  const grid: GridCell[] = rng.shuffle([
    ...study.map((shape) => ({ shape, target: true })),
    ...distractors.map((shape) => ({ shape, target: false }))
  ])

  return {
    study,
    studyMs: cfg.studyMs,
    calcs: Array.from({ length: cfg.calcs }, () => makeCalc(rng)),
    calcTimeLimitMs: cfg.calcTimeLimitMs,
    grid,
    gridTimeLimitMs: cfg.gridTimeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): ShapeRecallScenario {
  const rng = new Rng(`shape-recall:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  return {
    taskId: 'shape-recall',
    seed,
    difficulty,
    rounds: Array.from({ length: cfg.rounds }, () => makeRound(rng, cfg))
  }
}

/**
 * Items are flattened round by round: every calculation first, then every grid
 * cell (a cell is correct when selecting/leaving it matches whether it was
 * studied). Extras break the score down per stream.
 */
export function score(scenario: ShapeRecallScenario, answers: RecallAnswer[]): TaskResult {
  const byKey = new Map<string, RecallAnswer>()
  for (const a of answers) byKey.set(`${a.type}:${a.round}:${a.index}`, a)

  const items: ItemOutcome[] = []
  let calcCorrect = 0
  let calcTotal = 0
  let recallCorrect = 0
  let recallTotal = 0
  let falseAlarms = 0

  scenario.rounds.forEach((round, r) => {
    round.calcs.forEach((calc, i) => {
      calcTotal++
      const a = byKey.get(`calc:${r}:${i}`)
      if (!a || a.type !== 'calc' || a.answerIndex === null) {
        items.push({ index: items.length, correct: false, rtMs: a?.rtMs ?? 0, timedOut: true })
        return
      }
      const correct = a.answerIndex === calc.correctIndex
      if (correct) calcCorrect++
      items.push({ index: items.length, correct, rtMs: a.rtMs, timedOut: false })
    })
    round.grid.forEach((cell, i) => {
      recallTotal++
      const a = byKey.get(`grid:${r}:${i}`)
      const selected = a && a.type === 'grid' ? a.selected : false
      const correct = selected === cell.target
      if (correct) recallCorrect++
      if (selected && !cell.target) falseAlarms++
      items.push({ index: items.length, correct, rtMs: a?.rtMs ?? 0, timedOut: !a })
    })
  })

  return buildResult(scenario.taskId, items, {
    recallAccuracy: recallTotal === 0 ? 0 : recallCorrect / recallTotal,
    mathAccuracy: calcTotal === 0 ? 0 : calcCorrect / calcTotal,
    falseAlarms
  })
}

export const shapeRecallLogic: TaskLogic<ShapeRecallScenario, RecallAnswer[]> = {
  taskId: 'shape-recall',
  generate,
  score
}
