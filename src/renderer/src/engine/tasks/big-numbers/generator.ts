import { formatNumber, numberToWords } from '@shared/numberWords'
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
 * Recall Big Numbers — auditory number memory. A spoken sentence containing
 * a large number plays once; pick the exact number from four options.
 * Generation is pure; the view performs the actual TTS playback.
 */
export interface BigNumberItem {
  number: number
  /** Full sentence for TTS ("… four million three hundred seventy thousand …"). */
  spokenText: string
  options: string[]
  correctIndex: number
  /** Answer window that starts after audio playback ends. */
  timeLimitMs: number
}

export interface BigNumberScenario extends ScenarioBase {
  taskId: 'big-numbers'
  items: BigNumberItem[]
}

interface Config {
  items: number
  minDigits: number
  maxDigits: number
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 8, minDigits: 4, maxDigits: 4, timeLimitMs: 14000 },
  2: { items: 10, minDigits: 5, maxDigits: 5, timeLimitMs: 13000 },
  3: { items: 10, minDigits: 6, maxDigits: 6, timeLimitMs: 12000 },
  4: { items: 12, minDigits: 6, maxDigits: 7, timeLimitMs: 11000 },
  5: { items: 12, minDigits: 7, maxDigits: 7, timeLimitMs: 10000 }
}

/** Original sentence templates; {N} is replaced by the number in words. */
const TEMPLATES = [
  'The control centre processed {N} data records last month.',
  'The airline carried {N} passengers over the past year.',
  'The airport handled {N} pieces of baggage in June.',
  'The radar site logged {N} position updates overnight.',
  'The company produced {N} components last quarter.',
  'The network transmitted {N} messages during the exercise.',
  'The survey covered {N} square metres of terrain.',
  'The archive contains {N} scanned documents.',
  'The station recorded {N} vehicle crossings this week.',
  'The observatory captured {N} measurements in a single night.'
]

function randomWithDigits(rng: Rng, digits: number): number {
  const min = 10 ** (digits - 1)
  const max = 10 ** digits - 1
  // Halve the trailing digits sometimes to produce round-ish numbers
  // (e.g. 4,370,000) which are what spoken reports usually sound like.
  const n = rng.int(min, max)
  if (rng.bool(0.6)) {
    const zeros = rng.int(2, Math.max(2, digits - 2))
    return Math.max(min, Math.floor(n / 10 ** zeros) * 10 ** zeros)
  }
  return n
}

function digitsOf(n: number): number[] {
  return String(n).split('').map(Number)
}

function fromDigits(ds: number[]): number {
  return Number(ds.join(''))
}

/** Swap two adjacent digits (avoiding a leading zero). */
function transposeDigits(rng: Rng, n: number): number {
  const ds = digitsOf(n)
  for (let attempt = 0; attempt < 20; attempt++) {
    const i = rng.int(0, ds.length - 2)
    if (ds[i] === ds[i + 1]) continue
    if (i === 0 && ds[i + 1] === 0) continue
    const swapped = ds.slice()
    ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
    return fromDigits(swapped)
  }
  return changeOneDigit(rng, n)
}

/** Replace one digit with a different one (avoiding a leading zero). */
function changeOneDigit(rng: Rng, n: number): number {
  const ds = digitsOf(n)
  const i = rng.int(0, ds.length - 1)
  let d = rng.int(i === 0 ? 1 : 0, 9)
  if (d === ds[i]) d = d === 9 ? (i === 0 ? 1 : 0) : d + 1
  const out = ds.slice()
  out[i] = d
  return fromDigits(out)
}

function makeItem(rng: Rng, cfg: Config): BigNumberItem {
  const digits = rng.int(cfg.minDigits, cfg.maxDigits)
  const number = randomWithDigits(rng, digits)
  const template = rng.pick(TEMPLATES)
  const spokenText = template.replace('{N}', numberToWords(number))

  const values = new Set<number>([number])
  let guard = 0
  while (values.size < 4 && ++guard < 300) {
    const v = rng.bool() ? transposeDigits(rng, number) : changeOneDigit(rng, number)
    if (v !== number) values.add(v)
  }
  // Extremely round numbers can resist digit transposition; pad by offsets.
  let pad = 1
  while (values.size < 4) {
    values.add(number + pad * 10 ** (digits - 2))
    pad++
  }

  const options = rng.shuffle([...values].map(formatNumber))
  return {
    number,
    spokenText,
    options,
    correctIndex: options.indexOf(formatNumber(number)),
    timeLimitMs: cfg.timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): BigNumberScenario {
  const rng = new Rng(`big-numbers:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  return {
    taskId: 'big-numbers',
    seed,
    difficulty,
    items: Array.from({ length: cfg.items }, () => makeItem(rng, cfg))
  }
}

export function score(scenario: BigNumberScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const bigNumbersLogic: TaskLogic<BigNumberScenario, ItemResponse[]> = {
  taskId: 'big-numbers',
  generate,
  score
}
