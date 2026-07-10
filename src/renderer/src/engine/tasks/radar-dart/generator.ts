import { Rng } from '@shared/rng'
import type {
  Difficulty,
  ItemOutcome,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'
import { makeCallsign } from '../../sim/callsigns'

/**
 * DART-style radar test — conflict avoidance on a live scope. Aircraft
 * follow their own routes automatically; the player's job is to spot
 * developing conflicts, vector aircraft off route to keep separation
 * (5 NM / 1000 ft) and put them back on route so they still leave the
 * sector at their exit fix.
 */
export interface Fix {
  id: string
  x: number
  y: number
}

export interface DartSpawn {
  tMs: number
  callsign: string
  x: number
  y: number
  speedKts: number
  altitudeFl: number
  /** Fix ids to fly in order; the last one is the exit fix. */
  route: string[]
}

export interface DartScenario extends ScenarioBase {
  taskId: 'radar-dart'
  sectorNm: number
  fixes: Fix[]
  spawns: DartSpawn[]
  durationMs: number
  separationNm: number
  separationFl: number
  lookaheadS: number
  handoffRadiusNm: number
  waypointRadiusNm: number
}

/** What the live simulation logs; scoring is pure over this. */
export interface DartLog {
  handoffs: { callsign: string; correctExit: boolean }[]
  conflictEpisodes: number
  timeInConflictMs: number
  /** Aircraft still airborne when time ran out. */
  remaining: number
}

const SECTOR = 100

interface Config {
  initial: number
  spawnEveryMs: number
  durationMs: number
  speedMin: number
  speedMax: number
  /** Altitudes drawn from a small band to force vertical interaction. */
  altitudes: number[]
}

const CONFIG: Record<Difficulty, Config> = {
  1: { initial: 3, spawnEveryMs: 45_000, durationMs: 180_000, speedMin: 300, speedMax: 360, altitudes: [200, 210, 220] },
  2: { initial: 4, spawnEveryMs: 35_000, durationMs: 210_000, speedMin: 300, speedMax: 400, altitudes: [200, 210, 220] },
  3: { initial: 5, spawnEveryMs: 30_000, durationMs: 240_000, speedMin: 320, speedMax: 420, altitudes: [200, 210, 220, 230] },
  4: { initial: 6, spawnEveryMs: 25_000, durationMs: 270_000, speedMin: 340, speedMax: 460, altitudes: [200, 210, 220, 230] },
  5: { initial: 7, spawnEveryMs: 20_000, durationMs: 300_000, speedMin: 360, speedMax: 480, altitudes: [200, 210, 220] }
}

type Edge = 'N' | 'E' | 'S' | 'W'
const EDGES: readonly Edge[] = ['N', 'E', 'S', 'W']

const EXIT_FIXES: Fix[] = [
  { id: 'NOKTA', x: 50, y: 97 },
  { id: 'ESTIV', x: 97, y: 50 },
  { id: 'SUBRA', x: 50, y: 3 },
  { id: 'WELUN', x: 3, y: 50 }
]
const EXIT_BY_EDGE: Record<Edge, string> = { N: 'NOKTA', E: 'ESTIV', S: 'SUBRA', W: 'WELUN' }

const INNER_FIXES: Fix[] = [
  { id: 'CENTA', x: 50, y: 50 },
  { id: 'DELPO', x: 34, y: 62 },
  { id: 'RIMBA', x: 66, y: 38 }
]

function edgePoint(rng: Rng, edge: Edge): { x: number; y: number } {
  const along = rng.float(20, 80)
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

function makeSpawn(rng: Rng, cfg: Config, tMs: number, used: Set<string>): DartSpawn {
  const entryEdge = rng.pick(EDGES)
  const exitEdge = rng.pick(EDGES.filter((e) => e !== entryEdge))
  const entry = edgePoint(rng, entryEdge)
  const route: string[] = []
  // Most flights cross an interior fix, concentrating traffic.
  if (rng.bool(0.75)) route.push(rng.pick(INNER_FIXES).id)
  route.push(EXIT_BY_EDGE[exitEdge])
  return {
    tMs,
    callsign: makeCallsign(rng, used),
    x: entry.x,
    y: entry.y,
    speedKts: Math.round(rng.float(cfg.speedMin, cfg.speedMax) / 20) * 20,
    altitudeFl: rng.pick(cfg.altitudes),
    route
  }
}

export function generate(seed: string, difficulty: Difficulty): DartScenario {
  const rng = new Rng(`radar-dart:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const used = new Set<string>()
  const spawns: DartSpawn[] = []

  for (let i = 0; i < cfg.initial; i++) {
    spawns.push(makeSpawn(rng, cfg, i * 4000, used))
  }
  let t = 30_000
  while (t < cfg.durationMs - 60_000) {
    spawns.push(makeSpawn(rng, cfg, Math.round(t), used))
    t += cfg.spawnEveryMs * rng.float(0.75, 1.25)
  }

  return {
    taskId: 'radar-dart',
    seed,
    difficulty,
    sectorNm: SECTOR,
    fixes: [...EXIT_FIXES, ...INNER_FIXES],
    spawns,
    durationMs: cfg.durationMs,
    separationNm: 5,
    separationFl: 10,
    lookaheadS: 60,
    handoffRadiusNm: 5,
    waypointRadiusNm: 3
  }
}

/**
 * Pure scorer over the run log. Items are completed flights (handoffs);
 * conflicts and remaining traffic are reported as extra metrics.
 */
export function score(scenario: DartScenario, log: DartLog): TaskResult {
  const items: ItemOutcome[] = log.handoffs.map((h, index) => ({
    index,
    correct: h.correctExit,
    rtMs: 0,
    timedOut: false
  }))
  const correct = items.filter((i) => i.correct).length
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
      unfinishedFlights: log.remaining
    }
  }
}

export const radarDartLogic: TaskLogic<DartScenario, DartLog> = {
  taskId: 'radar-dart',
  generate,
  score
}
