import { degToRad, normalizeHeading, signedTurn } from '@shared/geometry'

/**
 * Shared aircraft kinematics for the FEAST-II-style simulations.
 * Coordinates are nautical miles inside a square sector, x east, y NORTH
 * (math convention — canvas views flip y when drawing). Altitude is in
 * flight levels (FL, hundreds of feet). All stepping is deterministic.
 */
export interface AircraftKinematics {
  x: number
  y: number
  headingDeg: number
  targetHeadingDeg: number
  speedKts: number
  altitudeFl: number
  targetAltitudeFl: number
}

/** Standard rate-ish turn used by all sims. */
export const TURN_RATE_DEG_S = 3
/** Climb/descent rate in FL per second (~1800 ft/min). */
export const CLIMB_RATE_FL_S = 0.3

/** Advance one aircraft by dtMs. Mutates the object (hot loop). */
export function stepAircraft(ac: AircraftKinematics, dtMs: number): void {
  const dtS = dtMs / 1000

  const turn = signedTurn(ac.headingDeg, ac.targetHeadingDeg)
  const maxTurn = TURN_RATE_DEG_S * dtS
  if (Math.abs(turn) <= maxTurn) {
    ac.headingDeg = normalizeHeading(ac.targetHeadingDeg)
  } else {
    ac.headingDeg = normalizeHeading(ac.headingDeg + Math.sign(turn) * maxTurn)
  }

  const dAlt = ac.targetAltitudeFl - ac.altitudeFl
  const maxClimb = CLIMB_RATE_FL_S * dtS
  if (Math.abs(dAlt) <= maxClimb) {
    ac.altitudeFl = ac.targetAltitudeFl
  } else {
    ac.altitudeFl += Math.sign(dAlt) * maxClimb
  }

  const distNm = (ac.speedKts / 3600) * dtS
  ac.x += Math.sin(degToRad(ac.headingDeg)) * distNm
  ac.y += Math.cos(degToRad(ac.headingDeg)) * distNm
}

export function lateralDistanceNm(
  a: Pick<AircraftKinematics, 'x' | 'y'>,
  b: Pick<AircraftKinematics, 'x' | 'y'>
): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Loss of separation: closer than sepNm laterally AND sepFl vertically. */
export function inConflict(
  a: AircraftKinematics,
  b: AircraftKinematics,
  sepNm: number,
  sepFl: number
): boolean {
  return (
    lateralDistanceNm(a, b) < sepNm && Math.abs(a.altitudeFl - b.altitudeFl) < sepFl
  )
}

/**
 * Sample-based conflict prediction: project both aircraft along their
 * CURRENT headings/altitude trends and report whether separation would be
 * lost within lookaheadS seconds. Deliberately simple — it drives the
 * amber "predicted conflict" warning, not the score.
 */
export function predictConflict(
  a: AircraftKinematics,
  b: AircraftKinematics,
  lookaheadS: number,
  sepNm: number,
  sepFl: number
): boolean {
  const pa: AircraftKinematics = { ...a, targetHeadingDeg: a.headingDeg }
  const pb: AircraftKinematics = { ...b, targetHeadingDeg: b.headingDeg }
  const stepS = 5
  for (let t = 0; t <= lookaheadS; t += stepS) {
    if (inConflict(pa, pb, sepNm, sepFl)) return true
    stepAircraft(pa, stepS * 1000)
    stepAircraft(pb, stepS * 1000)
  }
  return false
}

/**
 * Tracks separation-loss episodes over a run: an episode is a maximal
 * period during which a given pair stays in conflict. Reports episode
 * count and accumulated time in conflict (any pair).
 */
export class ConflictTracker {
  private activePairs = new Set<string>()
  private episodeCount = 0
  private timeInConflictMs = 0

  update(pairsNowInConflict: ReadonlySet<string>, dtMs: number): void {
    for (const pair of pairsNowInConflict) {
      if (!this.activePairs.has(pair)) this.episodeCount++
    }
    this.activePairs = new Set(pairsNowInConflict)
    if (pairsNowInConflict.size > 0) this.timeInConflictMs += dtMs
  }

  get episodes(): number {
    return this.episodeCount
  }

  get conflictMs(): number {
    return this.timeInConflictMs
  }
}

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

/** Heading that points from the aircraft to a target point. */
export function headingToPoint(
  ac: Pick<AircraftKinematics, 'x' | 'y'>,
  target: { x: number; y: number }
): number {
  return normalizeHeading((Math.atan2(target.x - ac.x, target.y - ac.y) * 180) / Math.PI)
}
