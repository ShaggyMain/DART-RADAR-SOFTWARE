import {
  ConflictTracker,
  headingToPoint,
  lateralDistanceNm,
  pairKey,
  stepAircraft,
  type AircraftKinematics
} from '../../sim/aircraft'
import type { Airport, MpLog, MpScenario } from './generator'

export type ReportState = 'none' | 'due' | 'acked' | 'missed'

export interface MpAircraft extends AircraftKinematics {
  callsign: string
  destination: Airport
  clearedTo: Airport | null
  vectored: boolean
  reportState: ReportState
  reportDeadlineMs: number
}

export type MpCommand =
  | { type: 'clear'; airport: Airport }
  | { type: 'turn'; deltaDeg: number }
  | { type: 'resume' }
  | { type: 'speed'; deltaKts: number }

export const MIN_SPEED_KTS = 140
export const MAX_SPEED_KTS = 420

/**
 * Live Multipass simulation (single flight level — lateral separation
 * only). Deterministic given scenario + command sequence. The report
 * window is passed in pre-scaled by the timing preset.
 */
export interface MpEvent {
  tMs: number
  text: string
  ok: boolean
}

export class MultipassSim {
  readonly aircraft: MpAircraft[] = []
  /** Feedback feed for the view: landings, losses, report outcomes. */
  readonly eventLog: MpEvent[] = []
  private readonly tracker = new ConflictTracker()
  private readonly outcomes: MpLog['outcomes'] = []
  private readonly reports: MpLog['reports'] = []
  private spawnCursor = 0
  private elapsedMs = 0
  conflictPairs = new Set<string>()

  constructor(
    private readonly scenario: MpScenario,
    private readonly reportWindowMs: number
  ) {}

  get elapsed(): number {
    return this.elapsedMs
  }

  get landedCount(): number {
    return this.outcomes.length
  }

  get conflictEpisodes(): number {
    return this.tracker.episodes
  }

  find(callsign: string): MpAircraft | undefined {
    return this.aircraft.find((a) => a.callsign === callsign)
  }

  command(callsign: string, cmd: MpCommand): void {
    const ac = this.find(callsign)
    if (!ac) return
    if (cmd.type === 'clear') {
      ac.clearedTo = cmd.airport
      ac.vectored = false
    } else if (cmd.type === 'turn') {
      ac.targetHeadingDeg = (((ac.targetHeadingDeg + cmd.deltaDeg) % 360) + 360) % 360
      ac.vectored = true
    } else if (cmd.type === 'speed') {
      const next = Math.round((ac.speedKts + cmd.deltaKts) / 20) * 20
      ac.speedKts = Math.min(MAX_SPEED_KTS, Math.max(MIN_SPEED_KTS, next))
    } else {
      ac.vectored = false
    }
  }

  /** Acknowledge a strip's REPORT call. Returns true when it was due. */
  ackReport(callsign: string): boolean {
    const ac = this.find(callsign)
    if (ac && ac.reportState === 'due') {
      ac.reportState = 'acked'
      this.reports.push({ callsign, acked: true })
      this.eventLog.push({ tMs: this.elapsedMs, text: `${callsign} report acknowledged`, ok: true })
      return true
    }
    return false
  }

  private airport(id: Airport): { x: number; y: number } {
    return this.scenario.airports.find((a) => a.id === id)!
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
      this.aircraft.push({
        callsign: sp.callsign,
        x: sp.x,
        y: sp.y,
        headingDeg: sp.headingDeg,
        targetHeadingDeg: sp.headingDeg,
        speedKts: sp.speedKts,
        altitudeFl: 100,
        targetAltitudeFl: 100,
        destination: sp.destination,
        clearedTo: null,
        vectored: false,
        reportState: 'none',
        reportDeadlineMs: 0
      })
    }

    for (const ac of this.aircraft) {
      if (ac.clearedTo && !ac.vectored) {
        ac.targetHeadingDeg = headingToPoint(ac, this.airport(ac.clearedTo))
      }
      stepAircraft(ac, moveDt)

      // REPORT lifecycle
      if (ac.clearedTo && ac.reportState === 'none') {
        const dist = lateralDistanceNm(ac, this.airport(ac.clearedTo))
        if (dist <= s.reportRadiusNm) {
          ac.reportState = 'due'
          ac.reportDeadlineMs = this.elapsedMs + this.reportWindowMs
        }
      }
      if (ac.reportState === 'due' && this.elapsedMs > ac.reportDeadlineMs) {
        ac.reportState = 'missed'
        this.reports.push({ callsign: ac.callsign, acked: false })
        this.eventLog.push({ tMs: this.elapsedMs, text: `${ac.callsign} REPORT missed`, ok: false })
      }
    }

    // Landings and sector exits.
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const ac = this.aircraft[i]
      if (ac.clearedTo) {
        const dist = lateralDistanceNm(ac, this.airport(ac.clearedTo))
        if (dist <= s.landRadiusNm) {
          if (ac.reportState === 'due') {
            ac.reportState = 'missed'
            this.reports.push({ callsign: ac.callsign, acked: false })
          }
          const correct = ac.clearedTo === ac.destination
          this.outcomes.push({ callsign: ac.callsign, landedCorrect: correct })
          this.eventLog.push({
            tMs: this.elapsedMs,
            text: correct
              ? `${ac.callsign} landed at ${ac.clearedTo} ✓`
              : `${ac.callsign} landed at ${ac.clearedTo} — wrong airport (dest ${ac.destination})`,
            ok: correct
          })
          this.aircraft.splice(i, 1)
          continue
        }
      }
      if (ac.x < -1 || ac.x > s.sectorNm + 1 || ac.y < -1 || ac.y > s.sectorNm + 1) {
        this.outcomes.push({ callsign: ac.callsign, landedCorrect: false })
        this.eventLog.push({
          tMs: this.elapsedMs,
          text: `${ac.callsign} left the sector — lost${ac.clearedTo ? '' : ' (was never cleared!)'}`,
          ok: false
        })
        this.aircraft.splice(i, 1)
      }
    }

    const pairs = new Set<string>()
    for (let i = 0; i < this.aircraft.length; i++) {
      for (let j = i + 1; j < this.aircraft.length; j++) {
        if (lateralDistanceNm(this.aircraft[i], this.aircraft[j]) < s.separationNm) {
          pairs.add(pairKey(this.aircraft[i].callsign, this.aircraft[j].callsign))
        }
      }
    }
    this.conflictPairs = pairs
    this.tracker.update(pairs, dtMs)
  }

  buildLog(audio: MpLog['audio'], falseMatches: number): MpLog {
    return {
      outcomes: this.outcomes.slice(),
      conflictEpisodes: this.tracker.episodes,
      timeInConflictMs: this.tracker.conflictMs,
      remaining: this.aircraft.length,
      reports: this.reports.slice(),
      audio,
      falseMatches
    }
  }
}
