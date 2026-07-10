import {
  equalUnderRotation,
  glyphKey,
  glyphsEqual,
  mirrorGlyph,
  mutateGlyph,
  randomGlyph,
  rotateGlyph,
  type Glyph
} from '@shared/glyphs'
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
 * Matching Figure — rapid perceptual comparison. A reference glyph is shown
 * with several candidates; exactly one matches under the current rule
 * (strict identity, or identity up to rotation at higher difficulty).
 */
export interface MatchingFigureItem {
  reference: Glyph
  options: Glyph[]
  correctIndex: number
  /** When true the correct option may be a rotated copy of the reference. */
  rotationsAllowed: boolean
  timeLimitMs: number
}

export interface MatchingFigureScenario extends ScenarioBase {
  taskId: 'matching-figure'
  items: MatchingFigureItem[]
}

interface Config {
  items: number
  size: number
  filled: number
  optionCount: number
  timeLimitMs: number
  rotationsAllowed: boolean
  /** Cells flipped to build near-miss distractors (fewer = harder). */
  mutationFlips: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 10, size: 4, filled: 6, optionCount: 4, timeLimitMs: 7000, rotationsAllowed: false, mutationFlips: 2 },
  2: { items: 12, size: 5, filled: 9, optionCount: 4, timeLimitMs: 6000, rotationsAllowed: false, mutationFlips: 2 },
  3: { items: 14, size: 5, filled: 10, optionCount: 5, timeLimitMs: 5000, rotationsAllowed: true, mutationFlips: 1 },
  4: { items: 16, size: 5, filled: 11, optionCount: 6, timeLimitMs: 4500, rotationsAllowed: true, mutationFlips: 1 },
  5: { items: 18, size: 6, filled: 15, optionCount: 6, timeLimitMs: 4000, rotationsAllowed: true, mutationFlips: 1 }
}

/** Does `candidate` count as a match for `reference` under the item's rule? */
export function isMatch(reference: Glyph, candidate: Glyph, rotationsAllowed: boolean): boolean {
  return rotationsAllowed
    ? equalUnderRotation(reference, candidate)
    : glyphsEqual(reference, candidate)
}

function makeDistractor(rng: Rng, reference: Glyph, cfg: Config): Glyph {
  const kind = rng.int(0, 2)
  if (kind === 0) return mutateGlyph(rng, reference, cfg.mutationFlips)
  if (kind === 1) return mirrorGlyph(mutateGlyph(rng, reference, rng.int(0, 1) === 0 ? cfg.mutationFlips : 1))
  // Rotated + mutated: near-miss that punishes shallow scanning.
  return mutateGlyph(rng, rotateGlyph(reference, rng.int(1, 3)), cfg.mutationFlips)
}

function generateItem(rng: Rng, cfg: Config): MatchingFigureItem {
  const reference = randomGlyph(rng, cfg.size, cfg.filled)
  const correct = cfg.rotationsAllowed
    ? rotateGlyph(reference, rng.int(1, 3))
    : { size: reference.size, cells: reference.cells.slice() }

  const used = new Set<string>([glyphKey(correct)])
  const distractors: Glyph[] = []
  let guard = 0
  while (distractors.length < cfg.optionCount - 1) {
    if (++guard > 500) throw new Error('matching-figure: could not build distinct distractors')
    const d = makeDistractor(rng, reference, cfg)
    if (isMatch(reference, d, cfg.rotationsAllowed)) continue
    const key = glyphKey(d)
    if (used.has(key)) continue
    used.add(key)
    distractors.push(d)
  }

  const options = rng.shuffle([correct, ...distractors])
  const correctIndex = options.findIndex((o) => glyphKey(o) === glyphKey(correct))
  return {
    reference,
    options,
    correctIndex,
    rotationsAllowed: cfg.rotationsAllowed,
    timeLimitMs: cfg.timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): MatchingFigureScenario {
  const rng = new Rng(`matching-figure:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  return {
    taskId: 'matching-figure',
    seed,
    difficulty,
    items: Array.from({ length: cfg.items }, () => generateItem(rng, cfg))
  }
}

export function score(
  scenario: MatchingFigureScenario,
  responses: ItemResponse[]
): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const matchingFigureLogic: TaskLogic<MatchingFigureScenario, ItemResponse[]> = {
  taskId: 'matching-figure',
  generate,
  score
}
