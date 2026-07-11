import {
  ConflictTracker,
  inConflict,
  pairKey,
  predictConflict,
  stepAircraft,
  type AircraftKinematics
} from '../../sim/aircraft'
import type { RcLog, RcScenario } from './generator'

export interface RcAircraft extends AircraftKinematics {
  callsign: string
  gateId: string
  /** Distance flown so far (nm), for the efficiency metric. */
  flownNm: number
  /** Straight-line distance entry → assigned gate. */
  directNm: number
}

export type RcCommand =
  | { type: 'turn'; deltaDeg: number }
  | { type: 'altitude'; deltaFl: number }
  | { type: 'speed'; deltaKts: number }

export const MIN_SPEED_KTS = 160
export const MAX_SPEED_KTS = 520

/** Live Radar Control simulation — no autopilot, player vectors everything. */
export class RadarControlSim {
  readonly aircraft: RcAircraft[] = []
  private readonly tracker = new ConflictTracker()
  private readonly exits: RcLog['exits'] = []
  private spawnCursor = 0
  private elapsedMs = 0
  private predictTimerMs = 0
  conflictPairs = new Set<string>()
  predictedPairs = new Set<string>()

  constructor(private readonly scenario: RcScenario) {}

  get elapsed(): number {
    return this.elapsedMs
  }

  get exitCount(): number {
    return this.exits.length
  }

  get conflictEpisodes(): number {
    return this.tracker.episodes
  }

  find(callsign: string): RcAircraft | undefined {
    return this.aircraft.find((a) => a.callsign === callsign)
  }

  command(callsign: string, cmd: RcCommand): void {
    const ac = this.find(callsign)
    if (!ac) return
    if (cmd.type === 'turn') {
      ac.targetHeadingDeg = (((ac.targetHeadingDeg + cmd.deltaDeg) % 360) + 360) % 360
    } else if (cmd.type === 'altitude') {
      const next = Math.round((ac.targetAltitudeFl + cmd.deltaFl) / 10) * 10
      ac.targetAltitudeFl = Math.min(400, Math.max(60, next))
    } else {
      const next = Math.round((ac.speedKts + cmd.deltaKts) / 20) * 20
      ac.speedKts = Math.min(MAX_SPEED_KTS, Math.max(MIN_SPEED_KTS, next))
    }
  }

  /** `moveScale` accelerates only aircraft motion (see DartSim.step). */
  step(dtMs: number, moveScale = 1): void {
    this.elapsedMs += dtMs
    const s = this.scenario
    const moveDt = dtMs * moveScale

    while (
      this.spawnCursor < s.spawns.length &&
      s.spawns[this.spawnCursor].tMs <= this.elapsedMs
    ) {
      const sp = s.spawns[this.spawnCursor++]
      const gate = s.gates.find((g) => g.id === sp.gateId)!
      this.aircraft.push({
        callsign: sp.callsign,
        x: sp.x,
        y: sp.y,
        headingDeg: sp.headingDeg,
        targetHeadingDeg: sp.headingDeg,
        speedKts: sp.speedKts,
        altitudeFl: sp.altitudeFl,
        targetAltitudeFl: sp.altitudeFl,
        gateId: sp.gateId,
        flownNm: 0,
        directNm: Math.hypot(sp.x - gate.x, sp.y - gate.y)
      })
    }

    for (const ac of this.aircraft) {
      const beforeX = ac.x
      const beforeY = ac.y
      stepAircraft(ac, moveDt)
      ac.flownNm += Math.hypot(ac.x - beforeX, ac.y - beforeY)
    }

    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const ac = this.aircraft[i]
      // Gates only "arm" once the flight is properly inside the sector,
      // so an entry point near an edge gate is not an instant exit.
      const gatesArmed = ac.flownNm > s.gateRadiusNm * 2
      const nearGate = gatesArmed
        ? s.gates.find((g) => Math.hypot(ac.x - g.x, ac.y - g.y) <= s.gateRadiusNm)
        : undefined
      if (nearGate) {
        this.exits.push({
          callsign: ac.callsign,
          correct: nearGate.id === ac.gateId,
          pathRatio: ac.directNm > 0 ? ac.flownNm / ac.directNm : 1
        })
        this.aircraft.splice(i, 1)
      } else if (ac.x < -1 || ac.x > s.sectorNm + 1 || ac.y < -1 || ac.y > s.sectorNm + 1) {
        this.exits.push({ callsign: ac.callsign, correct: false, pathRatio: 0 })
        this.aircraft.splice(i, 1)
      }
    }

    const pairs = new Set<string>()
    for (let i = 0; i < this.aircraft.length; i++) {
      for (let j = i + 1; j < this.aircraft.length; j++) {
        if (inConflict(this.aircraft[i], this.aircraft[j], s.separationNm, s.separationFl)) {
          pairs.add(pairKey(this.aircraft[i].callsign, this.aircraft[j].callsign))
        }
      }
    }
    this.conflictPairs = pairs
    this.tracker.update(pairs, dtMs)

    this.predictTimerMs += dtMs
    if (this.predictTimerMs >= 1000) {
      this.predictTimerMs = 0
      const predicted = new Set<string>()
      for (let i = 0; i < this.aircraft.length; i++) {
        for (let j = i + 1; j < this.aircraft.length; j++) {
          const key = pairKey(this.aircraft[i].callsign, this.aircraft[j].callsign)
          if (pairs.has(key)) continue
          if (
            predictConflict(this.aircraft[i], this.aircraft[j], s.lookaheadS, s.separationNm, s.separationFl)
          ) {
            predicted.add(key)
          }
        }
      }
      this.predictedPairs = predicted
    }
  }

  buildLog(audio: RcLog['audio'], falseAcks: number): RcLog {
    return {
      exits: this.exits.slice(),
      conflictEpisodes: this.tracker.episodes,
      timeInConflictMs: this.tracker.conflictMs,
      remaining: this.aircraft.length,
      audio,
      falseAcks
    }
  }
}
