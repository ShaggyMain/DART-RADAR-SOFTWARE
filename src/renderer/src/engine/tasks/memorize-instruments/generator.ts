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
 * Memorize Instruments — visual short-term memory. A panel of dial gauges
 * is shown briefly, then hidden; recall queried readings from options.
 */
export interface GaugeSpec {
  name: string
  unit: string
  min: number
  max: number
  step: number
}

export interface Gauge extends GaugeSpec {
  value: number
}

export interface InstrumentQuery {
  /** Index into the panel's gauges. */
  gaugeIndex: number
  options: string[]
  correctIndex: number
  timeLimitMs: number
}

export interface InstrumentsItem {
  gauges: Gauge[]
  exposureMs: number
  queries: InstrumentQuery[]
}

export interface InstrumentsScenario extends ScenarioBase {
  taskId: 'memorize-instruments'
  items: InstrumentsItem[]
}

/** Original gauge set — generic flight-style dials, no third-party layouts. */
export const GAUGE_POOL: readonly GaugeSpec[] = [
  { name: 'SPD', unit: 'kt', min: 0, max: 400, step: 20 },
  { name: 'ALT', unit: 'x1000 ft', min: 0, max: 40, step: 2 },
  { name: 'HDG', unit: '°', min: 0, max: 360, step: 20 },
  { name: 'FUEL', unit: '%', min: 0, max: 100, step: 5 },
  { name: 'TEMP', unit: '°C', min: -40, max: 40, step: 5 },
  { name: 'PWR', unit: '%', min: 0, max: 100, step: 5 }
]

interface Config {
  panels: number
  gauges: number
  exposureMs: number
  queriesPerPanel: number
  queryTimeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { panels: 6, gauges: 3, exposureMs: 8000, queriesPerPanel: 1, queryTimeLimitMs: 9000 },
  2: { panels: 6, gauges: 4, exposureMs: 7000, queriesPerPanel: 2, queryTimeLimitMs: 9000 },
  3: { panels: 6, gauges: 4, exposureMs: 6000, queriesPerPanel: 2, queryTimeLimitMs: 8000 },
  4: { panels: 6, gauges: 5, exposureMs: 5000, queriesPerPanel: 3, queryTimeLimitMs: 8000 },
  5: { panels: 6, gauges: 6, exposureMs: 4500, queriesPerPanel: 3, queryTimeLimitMs: 7000 }
}

export function formatReading(gauge: GaugeSpec, value: number): string {
  return `${value} ${gauge.unit}`
}

function snappedValue(rng: Rng, spec: GaugeSpec): number {
  const steps = Math.floor((spec.max - spec.min) / spec.step)
  // avoid the exact ends so the needle is always clearly inside the scale
  return spec.min + rng.int(1, steps - 1) * spec.step
}

function makeQuery(rng: Rng, gauges: Gauge[], gaugeIndex: number, timeLimitMs: number): InstrumentQuery {
  const gauge = gauges[gaugeIndex]
  const values = new Set<number>([gauge.value])
  let guard = 0
  while (values.size < 4 && ++guard < 200) {
    const offsetSteps = rng.int(1, 3) * (rng.bool() ? 1 : -1)
    const v = gauge.value + offsetSteps * gauge.step
    if (v < gauge.min || v > gauge.max) continue
    values.add(v)
  }
  // fallback: extend past the neighbours if the scale is too cramped
  let k = 4
  while (values.size < 4) {
    for (const v of [gauge.value + k * gauge.step, gauge.value - k * gauge.step]) {
      if (values.size < 4 && v >= gauge.min && v <= gauge.max) values.add(v)
    }
    if (++k > 50) throw new Error('memorize-instruments: cannot build 4 options')
  }
  const options = rng.shuffle([...values].map((v) => formatReading(gauge, v)))
  return {
    gaugeIndex,
    options,
    correctIndex: options.indexOf(formatReading(gauge, gauge.value)),
    timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): InstrumentsScenario {
  const rng = new Rng(`memorize-instruments:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const items: InstrumentsItem[] = []
  for (let p = 0; p < cfg.panels; p++) {
    const specs = rng.sample(GAUGE_POOL, cfg.gauges)
    const gauges: Gauge[] = specs.map((spec) => ({ ...spec, value: snappedValue(rng, spec) }))
    const queryIndices = rng.sample(
      Array.from({ length: gauges.length }, (_, i) => i),
      cfg.queriesPerPanel
    )
    items.push({
      gauges,
      exposureMs: cfg.exposureMs,
      queries: queryIndices.map((gi) => makeQuery(rng, gauges, gi, cfg.queryTimeLimitMs))
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
