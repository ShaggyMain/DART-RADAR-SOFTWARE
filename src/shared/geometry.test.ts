import { describe, expect, it } from 'vitest'
import {
  distance,
  headingDeg,
  normalizeHeading,
  pointAtHeading,
  signedTurn
} from './geometry'

describe('normalizeHeading', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeHeading(0)).toBe(0)
    expect(normalizeHeading(360)).toBe(0)
    expect(normalizeHeading(-90)).toBe(270)
    expect(normalizeHeading(725)).toBe(5)
  })
})

describe('headingDeg', () => {
  const o = { x: 0, y: 0 }
  it('uses compass convention (0=N, 90=E, 180=S, 270=W)', () => {
    expect(headingDeg(o, { x: 0, y: 5 })).toBe(0)
    expect(headingDeg(o, { x: 5, y: 0 })).toBe(90)
    expect(headingDeg(o, { x: 0, y: -5 })).toBe(180)
    expect(headingDeg(o, { x: -5, y: 0 })).toBe(270)
  })

  it('handles diagonals', () => {
    expect(headingDeg(o, { x: 3, y: 3 })).toBeCloseTo(45)
    expect(headingDeg(o, { x: -3, y: -3 })).toBeCloseTo(225)
  })
})

describe('signedTurn', () => {
  it('turns right for clockwise differences', () => {
    expect(signedTurn(0, 90)).toBe(90)
    expect(signedTurn(350, 10)).toBe(20)
  })

  it('turns left for counter-clockwise differences', () => {
    expect(signedTurn(90, 0)).toBe(-90)
    expect(signedTurn(10, 350)).toBe(-20)
  })

  it('treats 180° as a right turn (range (-180, 180])', () => {
    expect(signedTurn(0, 180)).toBe(180)
  })
})

describe('distance', () => {
  it('computes Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('pointAtHeading', () => {
  it('projects along compass headings', () => {
    const p = pointAtHeading({ x: 1, y: 1 }, 90, 2)
    expect(p.x).toBeCloseTo(3)
    expect(p.y).toBeCloseTo(1)
    const n = pointAtHeading({ x: 0, y: 0 }, 0, 4)
    expect(n.x).toBeCloseTo(0)
    expect(n.y).toBeCloseTo(4)
  })
})
