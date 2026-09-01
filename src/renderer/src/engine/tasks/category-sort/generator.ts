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
 * Category Sort — rule application under time pressure. One object is shown
 * and must be dropped into the right category box. Three general rules decide
 * the category, and two things can override them:
 *
 *   1. PAIR   — when the same object also appears in the "pair" box, the answer
 *               is always "Pair", whatever the rules or a message say.
 *   2. MESSAGE— a standing instruction that remaps one attribute, e.g.
 *               "Classify green shapes as blue".
 *   3. RULES  — coloured shape -> its colour, outline shape -> its shape,
 *               number -> the range it falls in.
 *
 * All stimuli are generated here and drawn by the view; nothing is copied from
 * any test vendor.
 */
export type SortColour = 'red' | 'blue' | 'green' | 'yellow'
export type SortShape = 'triangle' | 'square' | 'circle' | 'star'

export const SORT_COLOURS: readonly SortColour[] = ['red', 'blue', 'green', 'yellow']
export const SORT_SHAPES: readonly SortShape[] = ['triangle', 'square', 'circle', 'star']

export interface NumberRange {
  min: number
  max: number
}
export const NUMBER_RANGES: readonly NumberRange[] = [
  { min: 1, max: 50 },
  { min: 51, max: 100 },
  { min: 101, max: 150 }
]

/** The object shown in the item (or pair) box. */
export type SortObject =
  | { kind: 'colour'; shape: SortShape; colour: SortColour }
  | { kind: 'shape'; shape: SortShape }
  | { kind: 'number'; value: number }

export type SortCategory =
  | { type: 'pair' }
  | { type: 'colour'; colour: SortColour }
  | { type: 'shape'; shape: SortShape }
  | { type: 'range'; min: number; max: number }

/** A standing instruction that remaps one attribute before classifying. */
export type SortMessage =
  | { type: 'colour'; from: SortColour; to: SortColour }
  | { type: 'shape'; from: SortShape; to: SortShape }

export interface SortItem {
  object: SortObject
  /** Shown in the pair box, or null when there is no pair this item. */
  pairObject: SortObject | null
  message: SortMessage | null
  categories: SortCategory[]
  correctIndex: number
  timeLimitMs: number
}

export interface CategorySortScenario extends ScenarioBase {
  taskId: 'category-sort'
  items: SortItem[]
}

export function sameObject(a: SortObject, b: SortObject): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'colour' && b.kind === 'colour')
    return a.colour === b.colour && a.shape === b.shape
  if (a.kind === 'shape' && b.kind === 'shape') return a.shape === b.shape
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value
  return false
}

export function sameCategory(a: SortCategory, b: SortCategory): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'colour' && b.type === 'colour') return a.colour === b.colour
  if (a.type === 'shape' && b.type === 'shape') return a.shape === b.shape
  if (a.type === 'range' && b.type === 'range') return a.min === b.min && a.max === b.max
  return a.type === 'pair' && b.type === 'pair'
}

export function rangeOf(value: number): NumberRange {
  const found = NUMBER_RANGES.find((r) => value >= r.min && value <= r.max)
  if (!found) throw new Error(`category-sort: ${value} is outside every range`)
  return found
}

/**
 * The category an item belongs to — the whole rule engine, in priority order.
 * Pure and exported so the tests can pin every branch.
 */
export function resolveCategory(item: {
  object: SortObject
  pairObject: SortObject | null
  message: SortMessage | null
}): SortCategory {
  if (item.pairObject && sameObject(item.object, item.pairObject)) return { type: 'pair' }
  const o = item.object
  if (o.kind === 'colour') {
    const msg = item.message
    const colour = msg && msg.type === 'colour' && msg.from === o.colour ? msg.to : o.colour
    return { type: 'colour', colour }
  }
  if (o.kind === 'shape') {
    const msg = item.message
    const shape = msg && msg.type === 'shape' && msg.from === o.shape ? msg.to : o.shape
    return { type: 'shape', shape }
  }
  const r = rangeOf(o.value)
  return { type: 'range', min: r.min, max: r.max }
}

/** The category boxes offered for an object kind (plus Pair when one is shown). */
export function categoriesFor(objectKind: SortObject['kind'], withPair: boolean): SortCategory[] {
  const base: SortCategory[] =
    objectKind === 'colour'
      ? SORT_COLOURS.map((colour) => ({ type: 'colour', colour }))
      : objectKind === 'shape'
        ? SORT_SHAPES.map((shape) => ({ type: 'shape', shape }))
        : NUMBER_RANGES.map((r) => ({ type: 'range', min: r.min, max: r.max }))
  return withPair ? [{ type: 'pair' }, ...base] : base
}

export function messageText(message: SortMessage): string {
  return message.type === 'colour'
    ? `Classify ${message.from} objects as ${message.to}`
    : `Classify ${message.from}s as ${message.to}s`
}

interface Config {
  items: number
  kinds: SortObject['kind'][]
  pairProbability: number
  messageProbability: number
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 14, kinds: ['colour'], pairProbability: 0, messageProbability: 0, timeLimitMs: 5000 },
  2: {
    items: 16,
    kinds: ['colour', 'shape'],
    pairProbability: 0.25,
    messageProbability: 0,
    timeLimitMs: 4500
  },
  3: {
    items: 18,
    kinds: ['colour', 'shape', 'number'],
    pairProbability: 0.3,
    messageProbability: 0.25,
    timeLimitMs: 4000
  },
  4: {
    items: 20,
    kinds: ['colour', 'shape', 'number'],
    pairProbability: 0.3,
    messageProbability: 0.4,
    timeLimitMs: 3500
  },
  5: {
    items: 24,
    kinds: ['colour', 'shape', 'number'],
    pairProbability: 0.35,
    messageProbability: 0.5,
    timeLimitMs: 3000
  }
}

function randomObject(rng: Rng, kind: SortObject['kind']): SortObject {
  if (kind === 'colour') {
    return { kind, shape: rng.pick(SORT_SHAPES), colour: rng.pick(SORT_COLOURS) }
  }
  if (kind === 'shape') return { kind, shape: rng.pick(SORT_SHAPES) }
  return { kind, value: rng.int(1, 150) }
}

/** A different object of the same kind — used for a non-matching pair box. */
function differentObject(rng: Rng, like: SortObject): SortObject {
  for (let guard = 0; guard < 100; guard++) {
    const candidate = randomObject(rng, like.kind)
    if (!sameObject(candidate, like)) return candidate
  }
  throw new Error('category-sort: could not build a differing pair object')
}

/**
 * A message for this object. `applies` decides whether it targets the object's
 * own attribute (so it changes the answer) or another one (a decoy to read past).
 */
function makeMessage(rng: Rng, object: SortObject, applies: boolean): SortMessage | null {
  if (object.kind === 'colour') {
    const from = applies ? object.colour : rng.pick(SORT_COLOURS.filter((c) => c !== object.colour))
    const to = rng.pick(SORT_COLOURS.filter((c) => c !== from))
    return { type: 'colour', from, to }
  }
  if (object.kind === 'shape') {
    const from = applies ? object.shape : rng.pick(SORT_SHAPES.filter((s) => s !== object.shape))
    const to = rng.pick(SORT_SHAPES.filter((s) => s !== from))
    return { type: 'shape', from, to }
  }
  return null // numbers are classified by size only
}

export function generate(seed: string, difficulty: Difficulty): CategorySortScenario {
  const rng = new Rng(`category-sort:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const items: SortItem[] = []

  for (let i = 0; i < cfg.items; i++) {
    const kind = cfg.kinds[i % cfg.kinds.length]
    const object = randomObject(rng, kind)

    const withPair = rng.bool(cfg.pairProbability)
    // half of the pairs match (answer = Pair), half are a near-miss to read past
    const pairObject = withPair
      ? rng.bool(0.5)
        ? object
        : differentObject(rng, object)
      : null

    const message = rng.bool(cfg.messageProbability)
      ? makeMessage(rng, object, rng.bool(0.6))
      : null

    const categories = categoriesFor(kind, pairObject !== null)
    const target = resolveCategory({ object, pairObject, message })
    const correctIndex = categories.findIndex((c) => sameCategory(c, target))
    if (correctIndex < 0) throw new Error('category-sort: target category is not offered')

    items.push({ object, pairObject, message, categories, correctIndex, timeLimitMs: cfg.timeLimitMs })
  }

  return { taskId: 'category-sort', seed, difficulty, items }
}

export function score(scenario: CategorySortScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const categorySortLogic: TaskLogic<CategorySortScenario, ItemResponse[]> = {
  taskId: 'category-sort',
  generate,
  score
}
