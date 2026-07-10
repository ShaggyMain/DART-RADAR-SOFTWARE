import { Rng } from '@shared/rng'
import type {
  Difficulty,
  ItemOutcome,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'
import { makeCallsign, phoneticCallsign } from '../../sim/callsigns'

/**
 * Multipass — the full multitask work-sample. Three simultaneous demands:
 *  1. Route every arrival to its CORRECT airport (A west / B east),
 *     resolving lateral conflicts on the way.
 *  2. Manage flight strips: acknowledge each strip's REPORT call as the
 *     flight nears its cleared airport.
 *  3. Audio: spoken callsigns — confirm (MATCH) only those on your scope.
 */
export type Airport = 'A' | 'B'

export interface AirportSpec {
  id: Airport
  x: number
  y: number
}

export interface MpSpawn {
  tMs: number
  callsign: string
  x: number
  y: number
  headingDeg: number
  speedKts: number
  destination: Airport
}

export interface MpCall {
  tMs: number
  callsign: string
  spoken: string
}

export interface MpScenario extends ScenarioBase {
  taskId: 'multipass'
  sectorNm: number
  airports: AirportSpec[]
  spawns: MpSpawn[]
  calls: MpCall[]
  durationMs: number
  separationNm: number
  landRadiusNm: number
  reportRadiusNm: number
  reportWindowMs: number
  matchWindowMs: number
}

export interface MpLog {
  outcomes: { callsign: string; landedCorrect: boolean }[]
  conflictEpisodes: number
  timeInConflictMs: number
  remaining: number
  reports: { callsign: string; acked: boolean }[]
  audio: { callsign: string; present: boolean; matched: boolean }[]
  falseMatches: number
}

const SECTOR = 100

export const AIRPORTS: AirportSpec[] = [
  { id: 'A', x: 22, y: 50 },
  { id: 'B', x: 78, y: 50 }
]

type Edge = 'N' | 'E' | 'S' | 'W'
const EDGES: readonly Edge[] = ['N', 'E', 'S', 'W']

interface Config {
  initial: number
  spawnEveryMs: number
  durationMs: number
  speedMin: number
  speedMax: number
  callEveryMsMin: number
  callEveryMsMax: number
  presentProbability: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { initial: 3, spawnEveryMs: 35_000, durationMs: 180_000, speedMin: 240, speedMax: 280, callEveryMsMin: 20_000, callEveryMsMax: 28_000, presentProbability: 0.7 },
  2: { initial: 4, spawnEveryMs: 28_000, durationMs: 210_000, speedMin: 240, speedMax: 300, callEveryMsMin: 18_000, callEveryMsMax: 25_000, presentProbability: 0.7 },
  3: { initial: 5, spawnEveryMs: 24_000, durationMs: 240_000, speedMin: 260, speedMax: 320, callEveryMsMin: 15_000, callEveryMsMax: 21_000, presentProbability: 0.65 },
  4: { initial: 6, spawnEveryMs: 20_000, durationMs: 270_000, speedMin: 260, speedMax: 340, callEveryMsMin: 13_000, callEveryMsMax: 18_000, presentProbability: 0.65 },
  5: { initial: 7, spawnEveryMs: 16_000, durationMs: 300_000, speedMin: 280, speedMax: 360, callEveryMsMin: 11_000, callEveryMsMax: 16_000, presentProbability: 0.6 }
}

function edgePoint(rng: Rng, edge: Edge): { x: number; y: number } {
  const along = rng.float(15, 85)
  switch (edge) {
    case 'N':
      return { x: along, y: SECTOR }
    case 'S':
      return { x: along, y: 0 }
    case 'E':
      return { x: SECTOR, y: along }
    case 'W':
      return { x: 0, y: along }
  }
}

function inwardHeading(rng: Rng, edge: Edge): number {
  const base: Record<Edge, number> = { N: 180, S: 0, E: 270, W: 90 }
  return (((base[edge] + rng.float(-35, 35)) % 360) + 360) % 360
}

export function generate(seed: string, difficulty: Difficulty): MpScenario {
  const rng = new Rng(`multipass:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const used = new Set<string>()
  const spawns: MpSpawn[] = []

  const makeSpawn = (tMs: number): void => {
    const edge = rng.pick(EDGES)
    const entry = edgePoint(rng, edge)
    spawns.push({
      tMs,
      callsign: makeCallsign(rng, used),
      x: entry.x,
      y: entry.y,
      headingDeg: inwardHeading(rng, edge),
      speedKts: Math.round(rng.float(cfg.speedMin, cfg.speedMax) / 20) * 20,
      destination: rng.bool() ? 'A' : 'B'
    })
  }

  for (let i = 0; i < cfg.initial; i++) makeSpawn(i * 5000)
  let t = 28_000
  while (t < cfg.durationMs - 60_000) {
    makeSpawn(Math.round(t))
    t += cfg.spawnEveryMs * rng.float(0.75, 1.25)
  }

  const calls: MpCall[] = []
  let ct = rng.float(12_000, 20_000)
  while (ct < cfg.durationMs - 8_000) {
    let callsign: string
    if (rng.bool(cfg.presentProbability)) {
      const before = spawns.filter((sp) => sp.tMs < ct - 5000)
      callsign = before.length > 0 ? rng.pick(before).callsign : makeCallsign(rng, used)
    } else {
      callsign = makeCallsign(rng, used)
    }
    calls.push({ tMs: Math.round(ct), callsign, spoken: phoneticCallsign(callsign) })
    ct += rng.float(cfg.callEveryMsMin, cfg.callEveryMsMax)
  }

  return {
    taskId: 'multipass',
    seed,
    difficulty,
    sectorNm: SECTOR,
    airports: AIRPORTS,
    spawns,
    calls,
    durationMs: cfg.durationMs,
    separationNm: 4,
    landRadiusNm: 4,
    reportRadiusNm: 12,
    reportWindowMs: 12_000,
    matchWindowMs: 5_000
  }
}

export function score(scenario: MpScenario, log: MpLog): TaskResult {
  const items: ItemOutcome[] = log.outcomes.map((o, index) => ({
    index,
    correct: o.landedCorrect,
    rtMs: 0,
    timedOut: false
  }))
  const correct = items.filter((i) => i.correct).length
  const acked = log.reports.filter((r) => r.acked).length
  const audioCorrect = log.audio.filter((a) => a.matched === a.present).length

  return {
    taskId: scenario.taskId,
    totalItems: items.length,
    correct,
    accuracy: items.length === 0 ? 0 : correct / items.length,
    meanRtMs: null,
    items,
    extra: {
      conflicts: log.conflictEpisodes,
      timeInConflictSec: Math.round(log.timeInConflictMs / 1000),
      unfinishedFlights: log.remaining,
      reportAccuracy: log.reports.length === 0 ? 1 : acked / log.reports.length,
      audioAccuracy: log.audio.length === 0 ? 1 : audioCorrect / log.audio.length,
      falseAlarms: log.falseMatches
    }
  }
}

export const multipassLogic: TaskLogic<MpScenario, MpLog> = {
  taskId: 'multipass',
  generate,
  score
}
