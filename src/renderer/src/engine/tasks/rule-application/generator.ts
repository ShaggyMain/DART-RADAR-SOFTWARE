import { glyphKey, randomGlyph, type Glyph } from '@shared/glyphs'
import { Rng } from '@shared/rng'
import { buildResult, scoreMultipleChoice } from '@shared/scoring'
import type {
  Difficulty,
  ItemResponse,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * Learning & Applying Rules — a table maps abstract symbols to digits.
 * Reference symbols appear in sequence; assign each its digit under the
 * CURRENT table. The table changes one or more times mid-run.
 */
export interface RulePair {
  glyph: Glyph
  digit: number
}

export interface RulePhase {
  mapping: RulePair[]
  /** Index of the first item that uses this phase. */
  startIndex: number
}

export interface RuleItem {
  phaseIndex: number
  /** Index into the phase's mapping for the shown reference glyph. */
  pairIndex: number
  options: number[]
  correctIndex: number
  /** True for the first item after a rule change (view shows a banner). */
  isPhaseStart: boolean
  timeLimitMs: number
}

export interface RuleScenario extends ScenarioBase {
  taskId: 'rule-application'
  phases: RulePhase[]
  items: RuleItem[]
}

interface Config {
  pairs: number
  phases: number
  items: number
  optionCount: number
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { pairs: 4, phases: 1, items: 16, optionCount: 4, timeLimitMs: 7000 },
  2: { pairs: 5, phases: 2, items: 20, optionCount: 4, timeLimitMs: 6000 },
  3: { pairs: 6, phases: 2, items: 24, optionCount: 4, timeLimitMs: 5500 },
  4: { pairs: 7, phases: 3, items: 28, optionCount: 5, timeLimitMs: 5000 },
  5: { pairs: 8, phases: 3, items: 32, optionCount: 5, timeLimitMs: 4500 }
}

function distinctGlyphs(rng: Rng, count: number): Glyph[] {
  const glyphs: Glyph[] = []
  const used = new Set<string>()
  let guard = 0
  while (glyphs.length < count) {
    if (++guard > 500) throw new Error('rule-application: could not build distinct glyphs')
    const g = randomGlyph(rng, 4, 6)
    const key = glyphKey(g)
    if (used.has(key)) continue
    used.add(key)
    glyphs.push(g)
  }
  return glyphs
}

/** Reassign digits so that at least half of the pairs actually change. */
function reshuffleDigits(rng: Rng, prev: number[]): number[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const next = rng.shuffle(prev)
    const changed = next.filter((d, i) => d !== prev[i]).length
    if (changed >= Math.ceil(prev.length / 2)) return next
  }
  // rotate as a deterministic fallback — changes every position
  return [...prev.slice(1), prev[0]]
}

export function generate(seed: string, difficulty: Difficulty): RuleScenario {
  const rng = new Rng(`rule-application:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]

  const glyphs = distinctGlyphs(rng, cfg.pairs)
  const digitPool = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], cfg.pairs)

  const phases: RulePhase[] = []
  let digits = digitPool
  const itemsPerPhase = Math.floor(cfg.items / cfg.phases)
  for (let p = 0; p < cfg.phases; p++) {
    if (p > 0) digits = reshuffleDigits(rng, digits)
    phases.push({
      mapping: glyphs.map((glyph, i) => ({ glyph, digit: digits[i] })),
      startIndex: p * itemsPerPhase
    })
  }

  const items: RuleItem[] = []
  for (let i = 0; i < cfg.items; i++) {
    const phaseIndex = Math.min(Math.floor(i / itemsPerPhase), cfg.phases - 1)
    const phase = phases[phaseIndex]
    const pairIndex = rng.int(0, phase.mapping.length - 1)
    const correctDigit = phase.mapping[pairIndex].digit
    const others = phase.mapping
      .map((p) => p.digit)
      .filter((d) => d !== correctDigit)
    const optionDigits = rng.shuffle([correctDigit, ...rng.sample(others, cfg.optionCount - 1)])
    items.push({
      phaseIndex,
      pairIndex,
      options: optionDigits,
      correctIndex: optionDigits.indexOf(correctDigit),
      isPhaseStart: phaseIndex > 0 && i === phase.startIndex,
      timeLimitMs: cfg.timeLimitMs
    })
  }

  return { taskId: 'rule-application', seed, difficulty, phases, items }
}

/** How many of the first `window` items after each rule change were correct. */
const ADAPTATION_WINDOW = 3

export function score(scenario: RuleScenario, responses: ItemResponse[]): TaskResult {
  const base = scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
  if (scenario.phases.length < 2) return base

  let adaptTotal = 0
  let adaptCorrect = 0
  for (const phase of scenario.phases.slice(1)) {
    for (let i = phase.startIndex; i < phase.startIndex + ADAPTATION_WINDOW; i++) {
      const outcome = base.items[i]
      if (!outcome) continue
      adaptTotal++
      if (outcome.correct) adaptCorrect++
    }
  }
  return buildResult(scenario.taskId, base.items, {
    postChangeAccuracy: adaptTotal === 0 ? 0 : adaptCorrect / adaptTotal
  })
}

export const ruleApplicationLogic: TaskLogic<RuleScenario, ItemResponse[]> = {
  taskId: 'rule-application',
  generate,
  score
}
