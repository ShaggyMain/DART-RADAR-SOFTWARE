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
 * Planning / Sequencing — rule-based landing order. Aircraft approach a
 * single runway; put them in the correct landing sequence obeying all rules.
 *
 * Rule priority (highest first):
 *  1. LOW FUEL aircraft land before all others (difficulty ≥ 2).
 *  2. If two arrival times differ by less than 1 minute, the JET lands
 *     before the PROP (difficulty ≥ 3).
 *  3. Earlier arrival time (distance ÷ speed) lands first.
 *
 * Scenarios are constructed so the resulting order is provably unique:
 * arrival times are either ≥ 2 minutes apart, or form designated
 * jet-vs-prop pairs exactly 0.5 minutes apart.
 */
export type AircraftType = 'jet' | 'prop'

export interface PlanningAircraft {
  callsign: string
  type: AircraftType
  speedKts: number
  distanceNm: number
  /** Exact arrival time in minutes (distanceNm / (speedKts/60)). */
  etaMin: number
  lowFuel: boolean
  /** Placement bearing for the map view only. */
  bearingDeg: number
}

export interface PlanningItem {
  /** Aircraft in display order (shuffled, NOT the answer order). */
  aircraft: PlanningAircraft[]
  rules: string[]
  correctOrder: string[]
  lowFuelRuleActive: boolean
  windowRuleActive: boolean
  timeLimitMs: number
}

export interface PlanningScenario extends ScenarioBase {
  taskId: 'planning'
  items: PlanningItem[]
}

export interface PlanningResponseItem {
  /** Callsigns in the order the user sequenced them. */
  order: string[]
  rtMs: number
}

interface Config {
  puzzles: number
  aircraft: number
  windowPairs: number
  lowFuelRule: boolean
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { puzzles: 3, aircraft: 3, windowPairs: 0, lowFuelRule: false, timeLimitMs: 90000 },
  2: { puzzles: 3, aircraft: 4, windowPairs: 0, lowFuelRule: true, timeLimitMs: 100000 },
  3: { puzzles: 3, aircraft: 5, windowPairs: 1, lowFuelRule: true, timeLimitMs: 120000 },
  4: { puzzles: 4, aircraft: 5, windowPairs: 2, lowFuelRule: true, timeLimitMs: 120000 },
  5: { puzzles: 4, aircraft: 6, windowPairs: 2, lowFuelRule: true, timeLimitMs: 150000 }
}

/** Nautical-miles-per-minute values that keep the mental math clean. */
const NPM_CHOICES = [2, 3, 4, 5, 6, 8] as const
const NPM_EVEN = [2, 4, 6, 8] as const

const WINDOW_MIN = 1 // "differ by less than 1 minute"

function ruleTexts(cfg: Config): string[] {
  const rules: string[] = []
  if (cfg.lowFuelRule) rules.push('Aircraft reporting LOW FUEL land before all others.')
  if (cfg.windowPairs > 0)
    rules.push(
      'If two arrival times differ by less than 1 minute, the JET lands before the PROP.'
    )
  rules.push('Otherwise, the aircraft with the earlier arrival time (distance ÷ speed) lands first.')
  return rules
}

/** Pairwise "a must land before b" under the item's rules. */
export function landsBefore(
  a: PlanningAircraft,
  b: PlanningAircraft,
  item: Pick<PlanningItem, 'lowFuelRuleActive' | 'windowRuleActive'>
): boolean {
  if (item.lowFuelRuleActive && a.lowFuel !== b.lowFuel) return a.lowFuel
  if (
    item.windowRuleActive &&
    Math.abs(a.etaMin - b.etaMin) < WINDOW_MIN &&
    a.type !== b.type
  ) {
    return a.type === 'jet'
  }
  return a.etaMin < b.etaMin
}

/** Count of aircraft pairs in `order` that violate the rules. */
export function countViolations(item: PlanningItem, order: string[]): number {
  const byCallsign = new Map(item.aircraft.map((a) => [a.callsign, a]))
  let violations = 0
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = byCallsign.get(order[i])
      const b = byCallsign.get(order[j])
      if (!a || !b) continue
      if (landsBefore(b, a, item)) violations++
    }
  }
  return violations
}

function makeCallsign(rng: Rng, used: Set<string>): string {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ' // no I/O/Q to avoid digit confusion
  let guard = 0
  while (true) {
    if (++guard > 500) throw new Error('planning: callsign space exhausted')
    const cs =
      rng.pick([...letters]) +
      rng.pick([...letters]) +
      rng.pick([...letters]) +
      String(rng.int(100, 999))
    if (!used.has(cs)) {
      used.add(cs)
      return cs
    }
  }
}

interface EtaSlot {
  etaMin: number
  pairPartnerEta: number | null
}

function buildEtaSlots(rng: Rng, cfg: Config): EtaSlot[] {
  const slotCount = cfg.aircraft - cfg.windowPairs
  const slots: EtaSlot[] = []
  let eta = rng.int(4, 6)
  for (let i = 0; i < slotCount; i++) {
    slots.push({ etaMin: eta, pairPartnerEta: null })
    eta += rng.int(2, 4)
  }
  const pairIndices = rng.sample(
    Array.from({ length: slotCount }, (_, i) => i),
    cfg.windowPairs
  )
  for (const i of pairIndices) {
    slots[i].pairPartnerEta = slots[i].etaMin + 0.5
  }
  return slots
}

function buildAircraft(rng: Rng, cfg: Config): PlanningAircraft[] {
  const used = new Set<string>()
  const aircraft: PlanningAircraft[] = []

  for (const slot of buildEtaSlots(rng, cfg)) {
    if (slot.pairPartnerEta !== null) {
      // Designated jet-vs-prop pair 0.5 minutes apart.
      const jetFirst = rng.bool()
      const types: AircraftType[] = jetFirst ? ['jet', 'prop'] : ['prop', 'jet']
      const etas = [slot.etaMin, slot.pairPartnerEta]
      types.forEach((type, k) => {
        const npm = etas[k] % 1 === 0 ? rng.pick(NPM_CHOICES) : rng.pick(NPM_EVEN)
        aircraft.push({
          callsign: makeCallsign(rng, used),
          type,
          speedKts: npm * 60,
          distanceNm: npm * etas[k],
          etaMin: etas[k],
          lowFuel: false,
          bearingDeg: rng.int(0, 359)
        })
      })
    } else {
      const npm = rng.pick(NPM_CHOICES)
      aircraft.push({
        callsign: makeCallsign(rng, used),
        type: rng.bool() ? 'jet' : 'prop',
        speedKts: npm * 60,
        distanceNm: npm * slot.etaMin,
        etaMin: slot.etaMin,
        lowFuel: false,
        bearingDeg: rng.int(0, 359)
      })
    }
  }
  return aircraft
}

/** At least one closer aircraft must land later than a farther one. */
function isInteresting(aircraft: PlanningAircraft[]): boolean {
  for (const a of aircraft) {
    for (const b of aircraft) {
      if (a.distanceNm < b.distanceNm && a.etaMin > b.etaMin) return true
    }
  }
  return false
}

function makeItem(rng: Rng, cfg: Config): PlanningItem {
  let aircraft = buildAircraft(rng, cfg)
  for (let attempt = 0; attempt < 20 && !isInteresting(aircraft); attempt++) {
    aircraft = buildAircraft(rng, cfg)
  }

  // Low fuel: one aircraft that would NOT land first anyway, so the rule bites.
  if (cfg.lowFuelRule && rng.bool(0.7)) {
    const minEta = Math.min(...aircraft.map((a) => a.etaMin))
    const candidates = aircraft.filter((a) => a.etaMin !== minEta)
    if (candidates.length > 0) {
      rng.pick(candidates).lowFuel = true
    }
  }

  const ruleContext = {
    lowFuelRuleActive: cfg.lowFuelRule,
    windowRuleActive: cfg.windowPairs > 0
  }
  const correctOrder = aircraft
    .slice()
    .sort((a, b) => (landsBefore(a, b, ruleContext) ? -1 : 1))
    .map((a) => a.callsign)

  return {
    aircraft: rng.shuffle(aircraft),
    rules: ruleTexts(cfg),
    correctOrder,
    ...ruleContext,
    timeLimitMs: cfg.timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): PlanningScenario {
  const rng = new Rng(`planning:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  return {
    taskId: 'planning',
    seed,
    difficulty,
    items: Array.from({ length: cfg.puzzles }, () => makeItem(rng, cfg))
  }
}

export function score(scenario: PlanningScenario, responses: PlanningResponseItem[]): TaskResult {
  let totalViolations = 0
  const items: ItemOutcome[] = scenario.items.map((item, index) => {
    const r = responses[index]
    if (!r || r.order.length < item.aircraft.length) {
      totalViolations += countViolations(item, r?.order ?? [])
      return { index, correct: false, rtMs: r?.rtMs ?? 0, timedOut: true }
    }
    const exact =
      r.order.length === item.correctOrder.length &&
      r.order.every((cs, i) => cs === item.correctOrder[i])
    totalViolations += countViolations(item, r.order)
    return { index, correct: exact, rtMs: r.rtMs, timedOut: false }
  })
  return buildResult(scenario.taskId, items, { ruleViolations: totalViolations })
}

export const planningLogic: TaskLogic<PlanningScenario, PlanningResponseItem[]> = {
  taskId: 'planning',
  generate,
  score
}
