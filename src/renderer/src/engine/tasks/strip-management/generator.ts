import { Rng } from '@shared/rng'
import { buildResult } from '@shared/scoring'
import type {
  Difficulty,
  ItemOutcome,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'
import { makeCallsign } from '../../sim/callsigns'

/**
 * Strip Display Management — conflict detection from flight-strip DATA.
 * Strips represent flights inbound to fixed control points; each shows a
 * flight level and a live ETA countdown. Two strips CONFLICT when they are
 * at the same point, at the same level, with ETAs less than 3 minutes
 * apart. Click a conflicting strip to flag it — early detection scores.
 * Scheduled strip UPDATES (level changes) can create new conflicts.
 */
export interface ControlPoint {
  id: string
  name: string
}

export interface StripFlight {
  callsign: string
  pointId: string
  appearMs: number
  /** ETA in minutes, measured at appearMs; counts down in real time. */
  etaMinAtAppear: number
  fl: number
}

export interface StripUpdate {
  tMs: number
  callsign: string
  newFl: number
}

export interface StripScenario extends ScenarioBase {
  taskId: 'strip-management'
  points: ControlPoint[]
  flights: StripFlight[]
  updates: StripUpdate[]
  durationMs: number
  /** ETA gap below which same-point same-level strips conflict (minutes). */
  conflictEtaGapMin: number
  /** Ground truth: how many conflict episodes the schedule contains. */
  plannedConflicts: number
}

export interface FlagEvent {
  tMs: number
  callsign: string
}

/* ------------------------------------------------------------------ */
/* Pure live-state helpers (shared by episodes, scoring and the view)   */
/* ------------------------------------------------------------------ */

export interface StripState {
  etaMin: number
  fl: number
  present: boolean
}

export function stripStateAt(
  scenario: StripScenario,
  flight: StripFlight,
  tMs: number
): StripState {
  if (tMs < flight.appearMs) return { etaMin: flight.etaMinAtAppear, fl: flight.fl, present: false }
  let fl = flight.fl
  for (const u of scenario.updates) {
    if (u.callsign === flight.callsign && u.tMs <= tMs) fl = u.newFl
  }
  const etaMin = flight.etaMinAtAppear - (tMs - flight.appearMs) / 60_000
  return { etaMin, fl, present: etaMin > 0 }
}

/** Time at which the strip departs (ETA reaches zero). */
export function departureMs(flight: StripFlight): number {
  return flight.appearMs + flight.etaMinAtAppear * 60_000
}

export interface ConflictEpisode {
  a: string
  b: string
  pointId: string
  startMs: number
  endMs: number
}

/**
 * Exact conflict episodes for a schedule. Between breakpoints (appearances,
 * updates, departures) all strip states are constant or drift in lockstep,
 * so sampling each interval once is exact.
 */
export function computeEpisodes(scenario: StripScenario): ConflictEpisode[] {
  const breakpoints = new Set<number>([0, scenario.durationMs])
  for (const f of scenario.flights) {
    breakpoints.add(f.appearMs)
    breakpoints.add(Math.min(departureMs(f), scenario.durationMs))
  }
  for (const u of scenario.updates) breakpoints.add(u.tMs)
  const times = [...breakpoints].filter((t) => t <= scenario.durationMs).sort((x, y) => x - y)

  const open = new Map<string, ConflictEpisode>()
  const done: ConflictEpisode[] = []

  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]
    const t1 = times[i + 1]
    if (t1 - t0 <= 0) continue
    const mid = (t0 + t1) / 2

    const active = new Set<string>()
    for (let a = 0; a < scenario.flights.length; a++) {
      for (let b = a + 1; b < scenario.flights.length; b++) {
        const fa = scenario.flights[a]
        const fb = scenario.flights[b]
        if (fa.pointId !== fb.pointId) continue
        const sa = stripStateAt(scenario, fa, mid)
        const sb = stripStateAt(scenario, fb, mid)
        if (!sa.present || !sb.present) continue
        if (sa.fl !== sb.fl) continue
        if (Math.abs(sa.etaMin - sb.etaMin) >= scenario.conflictEtaGapMin) continue
        const key = fa.callsign < fb.callsign ? `${fa.callsign}|${fb.callsign}` : `${fb.callsign}|${fa.callsign}`
        active.add(key)
        if (!open.has(key)) {
          open.set(key, {
            a: fa.callsign,
            b: fb.callsign,
            pointId: fa.pointId,
            startMs: t0,
            endMs: t1
          })
        } else {
          open.get(key)!.endMs = t1
        }
      }
    }
    for (const [key, ep] of [...open]) {
      if (!active.has(key)) {
        done.push(ep)
        open.delete(key)
      }
    }
  }
  done.push(...open.values())
  return done.sort((x, y) => x.startMs - y.startMs)
}

/* ------------------------------------------------------------------ */
/* Generation                                                           */
/* ------------------------------------------------------------------ */

const POINT_NAMES = ['KARVIN', 'LUBEN', 'OSTRAV', 'WIDOK', 'TARNEK']
const LEVELS = [70, 80, 90, 100, 110]

interface Config {
  points: number
  immediatePairs: number
  updatePairs: number
  decoyPairs: number
  fillers: number
  durationMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { points: 3, immediatePairs: 3, updatePairs: 1, decoyPairs: 2, fillers: 5, durationMs: 150_000 },
  2: { points: 4, immediatePairs: 3, updatePairs: 2, decoyPairs: 3, fillers: 7, durationMs: 180_000 },
  3: { points: 4, immediatePairs: 4, updatePairs: 2, decoyPairs: 4, fillers: 9, durationMs: 210_000 },
  4: { points: 5, immediatePairs: 4, updatePairs: 3, decoyPairs: 5, fillers: 11, durationMs: 240_000 },
  5: { points: 5, immediatePairs: 5, updatePairs: 4, decoyPairs: 6, fillers: 13, durationMs: 240_000 }
}

/** ETA normalized to t=0 — gaps between strips never change over time. */
function etaAtZero(f: StripFlight): number {
  return f.etaMinAtAppear + f.appearMs / 60_000
}

export function generate(seed: string, difficulty: Difficulty): StripScenario {
  const rng = new Rng(`strip-management:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const points: ControlPoint[] = POINT_NAMES.slice(0, cfg.points).map((name) => ({
    id: name,
    name
  }))

  const used = new Set<string>()
  const flights: StripFlight[] = []
  const updates: StripUpdate[] = []
  // occupied ETA slots per point|fl bucket, in etaAtZero minutes
  const buckets = new Map<string, number[]>()

  const bucketOk = (pointId: string, fl: number, e0: number, minGap: number): boolean => {
    const list = buckets.get(`${pointId}|${fl}`) ?? []
    return list.every((x) => Math.abs(x - e0) >= minGap)
  }
  const claim = (pointId: string, fl: number, e0: number): void => {
    const key = `${pointId}|${fl}`
    buckets.set(key, [...(buckets.get(key) ?? []), e0])
  }

  const addFlight = (
    pointId: string,
    fl: number,
    appearMs: number,
    etaMinAtAppear: number
  ): StripFlight => {
    const f: StripFlight = {
      callsign: makeCallsign(rng, used),
      pointId,
      appearMs: Math.round(appearMs),
      etaMinAtAppear,
      fl
    }
    flights.push(f)
    claim(pointId, fl, etaAtZero(f))
    return f
  }

  const lastUseful = cfg.durationMs - 45_000

  // 1. Immediate conflict pairs: same point+FL, ETA gap 0.8–2.4 min.
  for (let i = 0; i < cfg.immediatePairs; i++) {
    let guard = 0
    while (guard++ < 200) {
      const point = rng.pick(points).id
      const fl = rng.pick(LEVELS)
      const t1 = rng.float(0, lastUseful - 40_000)
      const eta1 = rng.float(6, 13)
      const f1e0 = eta1 + t1 / 60_000
      const gap = rng.float(0.8, 2.4) * (rng.bool() ? 1 : -1)
      const f2e0 = f1e0 + gap
      const t2 = t1 + rng.float(10_000, 35_000)
      const eta2 = f2e0 - t2 / 60_000
      if (eta2 < 2.5) continue
      if (!bucketOk(point, fl, f1e0, 4) || !bucketOk(point, fl, f2e0, Math.abs(gap) - 0.01)) continue
      // f2 must clash ONLY with f1 in this bucket
      const others = (buckets.get(`${point}|${fl}`) ?? []).filter((x) => x !== f1e0)
      if (!others.every((x) => Math.abs(x - f2e0) >= 4)) continue
      addFlight(point, fl, t1, eta1)
      addFlight(point, fl, t2, eta2)
      break
    }
  }

  // 2. Update-created conflicts: partner joins the bucket via an FL change.
  for (let i = 0; i < cfg.updatePairs; i++) {
    let guard = 0
    while (guard++ < 200) {
      const point = rng.pick(points).id
      const fl = rng.pick(LEVELS)
      const otherFl = rng.pick(LEVELS.filter((l) => l !== fl))
      const t1 = rng.float(0, lastUseful - 70_000)
      const eta1 = rng.float(7, 13)
      const f1e0 = eta1 + t1 / 60_000
      const gap = rng.float(0.8, 2.2) * (rng.bool() ? 1 : -1)
      const f2e0 = f1e0 + gap
      const t2 = t1 + rng.float(8_000, 25_000)
      const eta2 = f2e0 - t2 / 60_000
      const tUpdate = t2 + rng.float(15_000, 35_000)
      if (eta2 < 2.5 || tUpdate > lastUseful) continue
      // f2's ETA must still be positive well past the update
      if (f2e0 - tUpdate / 60_000 < 1.5) continue
      if (!bucketOk(point, fl, f1e0, 4)) continue
      if (!bucketOk(point, otherFl, f2e0, 4)) continue
      const targets = buckets.get(`${point}|${fl}`) ?? []
      if (!targets.every((x) => x === f1e0 || Math.abs(x - f2e0) >= 4)) continue
      addFlight(point, fl, t1, eta1)
      const f2 = addFlight(point, otherFl, t2, eta2)
      updates.push({ tMs: Math.round(tUpdate), callsign: f2.callsign, newFl: fl })
      claim(point, fl, f2e0) // occupies the target bucket from the update on
      break
    }
  }

  // 3. Decoy pairs: same point+FL but a safe gap, or close ETA at
  //    different levels — near-misses that punish shallow reading.
  for (let i = 0; i < cfg.decoyPairs; i++) {
    let guard = 0
    while (guard++ < 200) {
      const point = rng.pick(points).id
      const sameLevel = rng.bool()
      const fl = rng.pick(LEVELS)
      const fl2 = sameLevel ? fl : rng.pick(LEVELS.filter((l) => l !== fl))
      const t1 = rng.float(0, lastUseful)
      const eta1 = rng.float(5, 13)
      const f1e0 = eta1 + t1 / 60_000
      const gap = sameLevel ? rng.float(4.5, 7) : rng.float(0.3, 2)
      const f2e0 = f1e0 + gap * (rng.bool() ? 1 : -1)
      const t2 = t1 + rng.float(5_000, 25_000)
      const eta2 = f2e0 - t2 / 60_000
      if (eta2 < 1.5) continue
      if (!bucketOk(point, fl, f1e0, 4) || !bucketOk(point, fl2, f2e0, 4)) continue
      addFlight(point, fl, t1, eta1)
      addFlight(point, fl2, t2, eta2)
      break
    }
  }

  // 4. Fillers.
  for (let i = 0; i < cfg.fillers; i++) {
    let guard = 0
    while (guard++ < 200) {
      const point = rng.pick(points).id
      const fl = rng.pick(LEVELS)
      const t = rng.float(0, cfg.durationMs - 30_000)
      const eta = rng.float(3, 14)
      const e0 = eta + t / 60_000
      if (!bucketOk(point, fl, e0, 4)) continue
      addFlight(point, fl, t, eta)
      break
    }
  }

  const scenario: StripScenario = {
    taskId: 'strip-management',
    seed,
    difficulty,
    points,
    flights: flights.sort((a, b) => a.appearMs - b.appearMs),
    updates: updates.sort((a, b) => a.tMs - b.tMs),
    durationMs: cfg.durationMs,
    conflictEtaGapMin: 3,
    plannedConflicts: 0
  }
  scenario.plannedConflicts = computeEpisodes(scenario).length
  return scenario
}

/* ------------------------------------------------------------------ */
/* Scoring                                                              */
/* ------------------------------------------------------------------ */

export function score(scenario: StripScenario, flags: FlagEvent[]): TaskResult {
  const episodes = computeEpisodes(scenario)
  const hit = new Array<boolean>(episodes.length).fill(false)
  const rt = new Array<number>(episodes.length).fill(0)
  let falseFlags = 0

  for (const flag of flags.slice().sort((x, y) => x.tMs - y.tMs)) {
    const idx = episodes.findIndex(
      (ep) =>
        (ep.a === flag.callsign || ep.b === flag.callsign) &&
        flag.tMs >= ep.startMs &&
        flag.tMs <= ep.endMs
    )
    if (idx === -1) {
      falseFlags++
      continue
    }
    // Any flag while the conflict is active counts; rtMs records how early
    // it was spotted. Duplicate flags on an already-found pair are ignored.
    if (!hit[idx]) {
      hit[idx] = true
      rt[idx] = flag.tMs - episodes[idx].startMs
    }
  }

  const items: ItemOutcome[] = episodes.map((_, index) => ({
    index,
    correct: hit[index],
    rtMs: rt[index],
    timedOut: !hit[index]
  }))
  return buildResult(scenario.taskId, items, { falseFlags })
}

export const stripManagementLogic: TaskLogic<StripScenario, FlagEvent[]> = {
  taskId: 'strip-management',
  generate,
  score
}
