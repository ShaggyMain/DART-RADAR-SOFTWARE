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
 * Instrument Recall — visual short-term memory. A panel of instruments is
 * shown briefly, then hidden; recall queried readings from options.
 *
 * Each instrument is a different *kind* of display (compass, thermometer,
 * battery, clock, speed-limit sign, segmented gauge) so the panel exercises
 * reading several visual formats, not one dial repeated. All artwork is drawn
 * from scratch in the view — generic instrument shapes, no third-party assets.
 */
export type InstrumentKind =
  | 'compass'
  | 'thermometer'
  | 'battery'
  | 'clock'
  | 'speedlimit'
  | 'gauge'

export interface InstrumentSpec {
  kind: InstrumentKind
  /** Label shown under the instrument and used to query it. */
  name: string
  /**
   * Inclusive value range and granularity. The value is a plain reading for
   * scaled instruments (°C, km/h), a segment count for battery/gauge, a
   * compass point index (0 = N, clockwise) for the compass, and minutes since
   * midnight for the clock.
   */
  min: number
  max: number
  step: number
  unit: string
}

export interface Instrument extends InstrumentSpec {
  value: number
}

export interface InstrumentQuery {
  /** Index into the panel's instruments. */
  instrumentIndex: number
  options: string[]
  correctIndex: number
  timeLimitMs: number
}

export interface InstrumentsItem {
  instruments: Instrument[]
  exposureMs: number
  queries: InstrumentQuery[]
}

export interface InstrumentsScenario extends ScenarioBase {
  taskId: 'memorize-instruments'
  items: InstrumentsItem[]
}

/** Compass points, clockwise from north — index order used by the value. */
export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** Segment counts for the two segmented instruments. */
export const BATTERY_SEGMENTS = 6
export const GAUGE_SEGMENTS = 7

/** Original instrument set — generic displays, no third-party layouts. */
export const INSTRUMENT_POOL: readonly InstrumentSpec[] = [
  { kind: 'compass', name: 'COMPASS', min: 0, max: COMPASS_POINTS.length - 1, step: 1, unit: '' },
  { kind: 'thermometer', name: 'THERMOMETER', min: -20, max: 40, step: 5, unit: '°C' },
  { kind: 'battery', name: 'BATTERY', min: 0, max: BATTERY_SEGMENTS, step: 1, unit: 'bars' },
  // clock: minutes since midnight on a 12-hour face, half-hour steps
  { kind: 'clock', name: 'CLOCK', min: 60, max: 720, step: 30, unit: '' },
  { kind: 'speedlimit', name: 'SPEEDLIMIT', min: 20, max: 140, step: 10, unit: 'km/h' },
  { kind: 'gauge', name: 'GAUGE', min: 0, max: GAUGE_SEGMENTS, step: 1, unit: 'segments' }
]

interface Config {
  panels: number
  instruments: number
  exposureMs: number
  queriesPerPanel: number
  queryTimeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { panels: 6, instruments: 3, exposureMs: 8000, queriesPerPanel: 1, queryTimeLimitMs: 9000 },
  2: { panels: 6, instruments: 4, exposureMs: 7000, queriesPerPanel: 2, queryTimeLimitMs: 9000 },
  3: { panels: 6, instruments: 4, exposureMs: 6000, queriesPerPanel: 2, queryTimeLimitMs: 8000 },
  4: { panels: 6, instruments: 5, exposureMs: 5000, queriesPerPanel: 3, queryTimeLimitMs: 8000 },
  5: { panels: 6, instruments: 6, exposureMs: 4500, queriesPerPanel: 3, queryTimeLimitMs: 7000 }
}

export function formatReading(spec: InstrumentSpec, value: number): string {
  switch (spec.kind) {
    case 'compass':
      return COMPASS_POINTS[((value % COMPASS_POINTS.length) + COMPASS_POINTS.length) % COMPASS_POINTS.length]
    case 'clock': {
      const h = Math.floor(value / 60)
      const m = value % 60
      return `${h}:${String(m).padStart(2, '0')}`
    }
    case 'battery':
      return `${value} / ${BATTERY_SEGMENTS}`
    case 'gauge':
      return `${value} / ${GAUGE_SEGMENTS}`
    default:
      return `${value} ${spec.unit}`
  }
}

/**
 * A value `steps` away from `value`, or null when that leaves the scale. The
 * compass wraps (one step back from N is NW); every other instrument is bounded.
 */
function offsetValue(spec: InstrumentSpec, value: number, steps: number): number | null {
  const v = value + steps * spec.step
  if (spec.kind === 'compass') {
    const n = COMPASS_POINTS.length
    return ((v % n) + n) % n
  }
  return v < spec.min || v > spec.max ? null : v
}

function snappedValue(rng: Rng, spec: InstrumentSpec): number {
  // A compass reads all the way round; the others avoid the exact scale ends
  // so a needle/column is always clearly inside its range.
  if (spec.kind === 'compass') return rng.int(spec.min, spec.max)
  const steps = Math.floor((spec.max - spec.min) / spec.step)
  return spec.min + rng.int(1, steps - 1) * spec.step
}

function makeQuery(
  rng: Rng,
  instruments: Instrument[],
  instrumentIndex: number,
  timeLimitMs: number
): InstrumentQuery {
  const inst = instruments[instrumentIndex]
  const values = new Set<number>([inst.value])
  let guard = 0
  while (values.size < 4 && ++guard < 200) {
    const offsetSteps = rng.int(1, 3) * (rng.bool() ? 1 : -1)
    const v = offsetValue(inst, inst.value, offsetSteps)
    if (v !== null) values.add(v)
  }
  // fallback: extend past the neighbours if the scale is too cramped
  let k = 4
  while (values.size < 4) {
    for (const s of [k, -k]) {
      const v = offsetValue(inst, inst.value, s)
      if (values.size < 4 && v !== null) values.add(v)
    }
    if (++k > 50) throw new Error('memorize-instruments: cannot build 4 options')
  }
  const options = rng.shuffle([...values].map((v) => formatReading(inst, v)))
  return {
    instrumentIndex,
    options,
    correctIndex: options.indexOf(formatReading(inst, inst.value)),
    timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): InstrumentsScenario {
  const rng = new Rng(`memorize-instruments:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const items: InstrumentsItem[] = []
  for (let p = 0; p < cfg.panels; p++) {
    const specs = rng.sample(INSTRUMENT_POOL, cfg.instruments)
    const instruments: Instrument[] = specs.map((spec) => ({
      ...spec,
      value: snappedValue(rng, spec)
    }))
    const queryIndices = rng.sample(
      Array.from({ length: instruments.length }, (_, i) => i),
      cfg.queriesPerPanel
    )
    items.push({
      instruments,
      exposureMs: cfg.exposureMs,
      queries: queryIndices.map((gi) => makeQuery(rng, instruments, gi, cfg.queryTimeLimitMs))
    })
  }
  return { taskId: 'memorize-instruments', seed, difficulty, items }
}

/** Responses are flattened across panels, in panel order then query order. */
export function score(scenario: InstrumentsScenario, responses: ItemResponse[]): TaskResult {
  const correctIndices = scenario.items.flatMap((item) => item.queries.map((q) => q.correctIndex))
  return scoreMultipleChoice(scenario.taskId, correctIndices, responses)
}

export const memorizeInstrumentsLogic: TaskLogic<InstrumentsScenario, ItemResponse[]> = {
  taskId: 'memorize-instruments',
  generate,
  score
}
