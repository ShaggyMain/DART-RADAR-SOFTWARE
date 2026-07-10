import { describe, expect, it } from 'vitest'
import {
  ConflictTracker,
  headingToPoint,
  inConflict,
  lateralDistanceNm,
  pairKey,
  predictConflict,
  stepAircraft,
  type AircraftKinematics
} from './aircraft'

function ac(overrides: Partial<AircraftKinematics> = {}): AircraftKinematics {
  return {
    x: 50,
    y: 50,
    headingDeg: 0,
    targetHeadingDeg: 0,
    speedKts: 360,
    altitudeFl: 200,
    targetAltitudeFl: 200,
    ...overrides
  }
}

describe('stepAircraft', () => {
  it('moves north at the configured speed', () => {
    const a = ac({ speedKts: 360 }) // 360 kts = 0.1 nm/s
    stepAircraft(a, 10_000)
    expect(a.x).toBeCloseTo(50)
    expect(a.y).toBeCloseTo(51)
  })

  it('turns toward the target heading at 3°/s taking the short way', () => {
    const a = ac({ headingDeg: 350, targetHeadingDeg: 20 })
    stepAircraft(a, 1000)
    expect(a.headingDeg).toBeCloseTo(353)
    // long enough to capture the target exactly
    stepAircraft(a, 20_000)
    expect(a.headingDeg).toBe(20)
  })

  it('turns left when that is shorter', () => {
    const a = ac({ headingDeg: 20, targetHeadingDeg: 350 })
    stepAircraft(a, 1000)
    expect(a.headingDeg).toBeCloseTo(17)
  })

  it('climbs and captures the target level', () => {
    const a = ac({ altitudeFl: 200, targetAltitudeFl: 210 })
    stepAircraft(a, 10_000) // 0.3 FL/s * 10s = 3 FL
    expect(a.altitudeFl).toBeCloseTo(203)
    stepAircraft(a, 60_000)
    expect(a.altitudeFl).toBe(210)
  })

  it('is deterministic for equal step sequences', () => {
    const a = ac({ headingDeg: 10, targetHeadingDeg: 80 })
    const b = ac({ headingDeg: 10, targetHeadingDeg: 80 })
    for (let i = 0; i < 100; i++) stepAircraft(a, 16.666)
    for (let i = 0; i < 100; i++) stepAircraft(b, 16.666)
    expect(a).toEqual(b)
  })
})

describe('separation', () => {
  it('detects lateral+vertical loss of separation', () => {
    const a = ac({ x: 50, y: 50, altitudeFl: 200 })
    const b = ac({ x: 53, y: 50, altitudeFl: 205 })
    expect(inConflict(a, b, 5, 10)).toBe(true)
    expect(inConflict(a, b, 5, 4)).toBe(false) // vertical separation ok
    expect(lateralDistanceNm(a, b)).toBeCloseTo(3)
  })

  it('predicts a head-on conflict within lookahead', () => {
    const a = ac({ x: 40, y: 50, headingDeg: 90, targetHeadingDeg: 90 })
    const b = ac({ x: 60, y: 50, headingDeg: 270, targetHeadingDeg: 270 })
    // closing at 720 kts = 0.2 nm/s over a 20nm gap → conflict in ~75s
    expect(predictConflict(a, b, 120, 5, 10)).toBe(true)
    expect(predictConflict(a, b, 30, 5, 10)).toBe(false)
  })
})

describe('ConflictTracker', () => {
  it('counts episodes and accumulates conflict time', () => {
    const t = new ConflictTracker()
    const pair = pairKey('B', 'A')
    t.update(new Set([pair]), 1000)
    t.update(new Set([pair]), 1000)
    t.update(new Set(), 1000)
    t.update(new Set([pair]), 1000) // second episode of the same pair
    expect(t.episodes).toBe(2)
    expect(t.conflictMs).toBe(3000)
  })

  it('counts overlapping pairs as separate episodes', () => {
    const t = new ConflictTracker()
    t.update(new Set([pairKey('A', 'B'), pairKey('C', 'D')]), 500)
    expect(t.episodes).toBe(2)
    expect(t.conflictMs).toBe(500)
  })
})

describe('headingToPoint', () => {
  it('matches compass convention', () => {
    expect(headingToPoint({ x: 50, y: 50 }, { x: 50, y: 60 })).toBe(0)
    expect(headingToPoint({ x: 50, y: 50 }, { x: 60, y: 50 })).toBe(90)
    expect(headingToPoint({ x: 50, y: 50 }, { x: 50, y: 40 })).toBe(180)
  })
})

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey('X1', 'A2')).toBe(pairKey('A2', 'X1'))
  })
})
