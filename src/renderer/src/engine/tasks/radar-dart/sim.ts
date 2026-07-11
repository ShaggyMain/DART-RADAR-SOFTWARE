import {
  ConflictTracker,
  headingToPoint,
  inConflict,
  pairKey,
  predictConflict,
  stepAircraft,
  type AircraftKinematics
} from '../../sim/aircraft'
import type { DartLog, DartScenario, Fix } from './generator'

export interface DartAircraft extends AircraftKinematics {
  callsign: string
  /** Remaining fix ids; last is the exit fix. */
  route: string[]
  /** Full route as generated (for label display). */
  exitFixId: string
  /** True while a manual vector overrides auto-nav. */
  vectored: boolean
}

export type DartCommand =
  | { type: 'turn'; deltaDeg: number }
  | { type: 'resume' }
  | { type: 'altitude'; deltaFl: number }
  | { type: 'speed'; deltaKts: number }

/** Player-adjustable speed envelope (kts). */
export const MIN_SPEED_KTS = 160
export const MAX_SPEED_KTS = 560

/**
 * Live DART simulation. Fully deterministic given the scenario and the
 * sequence of (elapsed, command) inputs — no randomness at runtime.
 */
export class DartSim {
  readonly aircraft: DartAircraft[] = []
  private readonly fixById = new Map<string, Fix>()
  private readonly tracker = new ConflictTracker()
  private readonly handoffs: DartLog['handoffs'] = []
  private spawnCursor = 0
  private elapsedMs = 0
  private predictTimerMs = 0
  conflictPairs = new Set<string>()
  predictedPairs = new Set<string>()

  constructor(private readonly scenario: DartScenario) {
    for (const f of scenario.fixes) this.fixById.set(f.id, f)
  }

  get elapsed(): number {
    return this.elapsedMs
  }

  get handoffCount(): number {
    return this.handoffs.length
  }

  get conflictEpisodes(): number {
    return this.tracker.episodes
  }

  find(callsign: string): DartAircraft | undefined {
    return this.aircraft.find((a) => a.callsign === callsign)
  }

  command(callsign: string, cmd: DartCommand): void {
    const ac = this.find(callsign)
    if (!ac) return
    if (cmd.type === 'turn') {
      const base = ac.vectored ? ac.targetHeadingDeg : ac.headingDeg
      ac.targetHeadingDeg = (((base + cmd.deltaDeg) % 360) + 360) % 360
      ac.vectored = true
    } else if (cmd.type === 'resume') {
      ac.vectored = false
    } else if (cmd.type === 'altitude') {
      const next = Math.round((ac.targetAltitudeFl + cmd.deltaFl) / 10) * 10
      ac.targetAltitudeFl = Math.min(400, Math.max(60, next))
    } else {
      const next = Math.round((ac.speedKts + cmd.deltaKts) / 20) * 20
      ac.speedKts = Math.min(MAX_SPEED_KTS, Math.max(MIN_SPEED_KTS, next))
    }
  }

  /**
   * Advance the sim. `moveScale` accelerates ONLY aircraft motion (position,
   * turns, climbs) so traffic crosses the sector within a real-time session;
   * spawns, handoffs, conflict timing and the session clock stay on real dt.
   */
  step(dtMs: number, moveScale = 1): void {
    this.elapsedMs += dtMs
    const s = this.scenario
    const moveDt = dtMs * moveScale

    while (
      this.spawnCursor < s.spawns.length &&
      s.spawns[this.spawnCursor].tMs <= this.elapsedMs
    ) {
      const sp = s.spawns[this.spawnCursor++]
      const first = this.fixById.get(sp.route[0])!
      const heading = headingToPoint(sp, first)
      this.aircraft.push({
        callsign: sp.callsign,
        x: sp.x,
        y: sp.y,
        headingDeg: heading,
        targetHeadingDeg: heading,
        speedKts: sp.speedKts,
        altitudeFl: sp.altitudeFl,
        targetAltitudeFl: sp.altitudeFl,
        route: sp.route.slice(),
        exitFixId: sp.route[sp.route.length - 1],
        vectored: false
      })
    }

    for (const ac of this.aircraft) {
      if (!ac.vectored && ac.route.length > 0) {
        ac.targetHeadingDeg = headingToPoint(ac, this.fixById.get(ac.route[0])!)
      }
      stepAircraft(ac, moveDt)

      if (ac.route.length > 1) {
        const next = this.fixById.get(ac.route[0])!
        if (Math.hypot(ac.x - next.x, ac.y - next.y) <= s.waypointRadiusNm) {
          ac.route.shift()
        }
      }
    }

    // Handoffs and sector exits.
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const ac = this.aircraft[i]
      const exit = this.fixById.get(ac.exitFixId)!
      const onFinalLeg = ac.route.length === 1
      if (onFinalLeg && Math.hypot(ac.x - exit.x, ac.y - exit.y) <= s.handoffRadiusNm) {
        this.handoffs.push({ callsign: ac.callsign, correctExit: true })
        this.aircraft.splice(i, 1)
      } else if (ac.x < -1 || ac.x > s.sectorNm + 1 || ac.y < -1 || ac.y > s.sectorNm + 1) {
        this.handoffs.push({ callsign: ac.callsign, correctExit: false })
        this.aircraft.splice(i, 1)
      }
    }

    // Conflict bookkeeping.
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

    // Predicted conflicts, recomputed once a second (it is O(n²) sims).
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

  getLog(): DartLog {
    return {
      handoffs: this.handoffs.slice(),
      conflictEpisodes: this.tracker.episodes,
      timeInConflictMs: this.tracker.conflictMs,
      remaining: this.aircraft.length
    }
  }
}
