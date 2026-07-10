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
 * Radar Control — corridor/exit routing. Aircraft enter the sector on
 * arbitrary headings, each ASSIGNED an exit gate. Unlike DART there is no
 * autopilot: the player must vector every aircraft to its gate, keep
 * separation, fly efficiently, and answer radio checks (press ACK only
 * when the spoken callsign is currently on frequency).
 */
export interface Gate {
  id: string
  x: number
  y: number
}

export interface RcSpawn {
  tMs: number
  callsign: string
  x: number
  y: number
  headingDeg: number
  speedKts: number
  altitudeFl: number
  gateId: string
}

export interface RadioCall {
  tMs: number
  callsign: string
  /** TTS text, NATO phonetic. */
  spoken: string
}

export interface RcScenario extends ScenarioBase {
  taskId: 'radar-control'
  sectorNm: number
  gates: Gate[]
  spawns: RcSpawn[]
  calls: RadioCall[]
  durationMs: number
  separationNm: number
  separationFl: number
  lookaheadS: number
  gateRadiusNm: number
  ackWindowMs: number
}

export interface RcLog {
  exits: { callsign: string; correct: boolean; pathRatio: number }[]
  conflictEpisodes: number
  timeInConflictMs: number
  remaining: number
  /** One entry per radio call, with the truth AND the player's reaction. */
  audio: { callsign: string; present: boolean; acked: boolean }[]
  falseAcks: number
}

const SECTOR = 100

export const GATES: Gate[] = [
  { id: 'GATE-N', x: 50, y: 97 },
  { id: 'GATE-E', x: 97, y: 50 },
  { id: 'GATE-S', x: 50, y: 3 },
  { id: 'GATE-W', x: 3, y: 50 }
]

type Edge = 'N' | 'E' | 'S' | 'W'
const EDGES: readonly Edge[] = ['N', 'E', 'S', 'W']
const GATE_BY_EDGE: Record<Edge, string> = {
  N: 'GATE-N',
  E: 'GATE-E',
  S: 'GATE-S',
  W: 'GATE-W'
}

interface Config {
  initial: number
  spawnEveryMs: number
  durationMs: number
  speedMin: number
  speedMax: number
  altitudes: number[]
  callEveryMsMin: number
  callEveryMsMax: number
  presentProbability: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { initial: 2, spawnEveryMs: 40_000, durationMs: 180_000, speedMin: 280, speedMax: 340, altitudes: [210, 220], callEveryMsMin: 22_000, callEveryMsMax: 30_000, presentProbability: 0.65 },
  2: { initial: 3, spawnEveryMs: 34_000, durationMs: 210_000, speedMin: 280, speedMax: 360, altitudes: [210, 220, 230], callEveryMsMin: 20_000, callEveryMsMax: 28_000, presentProbability: 0.65 },
  3: { initial: 3, spawnEveryMs: 28_000, durationMs: 240_000, speedMin: 300, speedMax: 380, altitudes: [210, 220, 230], callEveryMsMin: 17_000, callEveryMsMax: 24_000, presentProbability: 0.6 },
  4: { initial: 4, spawnEveryMs: 24_000, durationMs: 270_000, speedMin: 300, speedMax: 400, altitudes: [200, 210, 220, 230], callEveryMsMin: 14_000, callEveryMsMax: 20_000, presentProbability: 0.6 },
  5: { initial: 5, spawnEveryMs: 20_000, durationMs: 300_000, speedMin: 320, speedMax: 420, altitudes: [200, 210, 220], callEveryMsMin: 12_000, callEveryMsMax: 18_000, presentProbability: 0.55 }
}

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

/** Heading pointing into the sector with up to ±40° of scatter. */
function inwardHeading(rng: Rng, edge: Edge): number {
  const base: Record<Edge, number> = { N: 180, S: 0, E: 270, W: 90 }
  return (((base[edge] + rng.float(-40, 40)) % 360) + 360) % 360
}

export function generate(seed: string, difficulty: Difficulty): RcScenario {
  const rng = new Rng(`radar-control:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const used = new Set<string>()
  const spawns: RcSpawn[] = []

  const makeSpawn = (tMs: number): void => {
    const entryEdge = rng.pick(EDGES)
    const gateEdge = rng.pick(EDGES.filter((e) => e !== entryEdge))
    const entry = edgePoint(rng, entryEdge)
    spawns.push({
      tMs,
      callsign: makeCallsign(rng, used),
      x: entry.x,
      y: entry.y,
      headingDeg: inwardHeading(rng, entryEdge),
      speedKts: Math.round(rng.float(cfg.speedMin, cfg.speedMax) / 20) * 20,
      altitudeFl: rng.pick(cfg.altitudes),
      gateId: GATE_BY_EDGE[gateEdge]
    })
  }

  for (let i = 0; i < cfg.initial; i++) makeSpawn(i * 5000)
  let t = 30_000
  while (t < cfg.durationMs - 60_000) {
    makeSpawn(Math.round(t))
    t += cfg.spawnEveryMs * rng.float(0.75, 1.25)
  }

  // Radio calls: mostly callsigns from the traffic (likely on frequency at
  // that moment), sometimes fabricated ones that never fly here.
  const calls: RadioCall[] = []
  let ct = rng.float(15_000, 25_000)
  while (ct < cfg.durationMs - 10_000) {
    let callsign: string
    if (rng.bool(cfg.presentProbability)) {
      // choose a flight that has spawned before the call time
      const before = spawns.filter((sp) => sp.tMs < ct - 5000)
      callsign = before.length > 0 ? rng.pick(before).callsign : makeCallsign(rng, used)
    } else {
      callsign = makeCallsign(rng, used)
    }
    calls.push({ tMs: Math.round(ct), callsign, spoken: phoneticCallsign(callsign) })
    ct += rng.float(cfg.callEveryMsMin, cfg.callEveryMsMax)
  }

  return {
    taskId: 'radar-control',
    seed,
    difficulty,
    sectorNm: SECTOR,
    gates: GATES,
    spawns,
    calls,
    durationMs: cfg.durationMs,
    separationNm: 5,
    separationFl: 10,
    lookaheadS: 60,
    gateRadiusNm: 6,
    ackWindowMs: 4500
  }
}

export function score(scenario: RcScenario, log: RcLog): TaskResult {
  const items: ItemOutcome[] = log.exits.map((e, index) => ({
    index,
    correct: e.correct,
    rtMs: 0,
    timedOut: false
  }))
  const correct = items.filter((i) => i.correct).length

  const ratios = log.exits.filter((e) => e.correct && e.pathRatio > 0)
  const efficiencyPct =
    ratios.length === 0
      ? 0
      : Math.round(
          (ratios.reduce((sum, e) => sum + Math.min(1, 1 / e.pathRatio), 0) / ratios.length) * 100
        )

  const audioCorrect = log.audio.filter((a) => a.acked === a.present).length

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
      routeEfficiency: efficiencyPct / 100,
      audioAccuracy: log.audio.length === 0 ? 0 : audioCorrect / log.audio.length,
      falseAlarms: log.falseAcks
    }
  }
}

export const radarControlLogic: TaskLogic<RcScenario, RcLog> = {
  taskId: 'radar-control',
  generate,
  score
}
