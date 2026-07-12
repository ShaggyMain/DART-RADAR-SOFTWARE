import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  generate,
  hasHeadOnConflict,
  headingUnit,
  score,
  toScreen,
  type ConflictAircraft
} from './generator'

/** Angle (deg) between the direction a glyph points and the vector to (wx, wy). */
function angleTo(u: { x: number; y: number }, wx: number, wy: number): number {
  const wlen = Math.hypot(wx, wy) || 1
  const dot = (u.x * wx + u.y * wy) / wlen
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}

/** Do two aircraft point at each other AS DRAWN on screen (post-projection)? */
function screenHeadOn(a: ConflictAircraft, b: ConflictAircraft, tol: number): boolean {
  const pa = toScreen(a)
  const pb = toScreen(b)
  const abx = pb.x - pa.x
  const aby = pb.y - pa.y
  return (
    angleTo(headingUnit(a.headingDeg), abx, aby) <= tol &&
    angleTo(headingUnit(b.headingDeg), -abx, -aby) <= tol
  )
}

function anyScreenHeadOn(aircraft: ConflictAircraft[], tol: number): boolean {
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      if (screenHeadOn(aircraft[i], aircraft[j], tol)) return true
    }
  }
  return false
}

describe('conflict-scan generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: stored truth matches the checker', (d) => {
    const s = generate('truth', d)
    for (const item of s.items) {
      expect(hasHeadOnConflict(item.aircraft, item.toleranceDeg)).toBe(item.conflict)
      expect(item.correctIndex).toBe(item.conflict ? 0 : 1)
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: no-conflict items keep a 2x safety margin', (d) => {
    const s = generate('margin', d)
    for (const item of s.items.filter((i) => !i.conflict)) {
      expect(hasHeadOnConflict(item.aircraft, item.toleranceDeg * 2)).toBe(false)
    }
  })

  // Guards the View: math coords are y-up but SVG is y-down, so positions are
  // flipped before drawing. If that flip and the heading rotation disagree,
  // every head-on pair renders vertically mirrored (looks like the opposite
  // answer). The on-screen picture must match the stored ground truth.
  it.each(DIFFICULTIES)('difficulty %i: on-screen geometry matches ground truth', (d) => {
    const s = generate('screen', d)
    for (const item of s.items) {
      expect(anyScreenHeadOn(item.aircraft, item.toleranceDeg)).toBe(item.conflict)
      if (!item.conflict) {
        // No accidental convergence even at 2x tolerance (matches the margin rule).
        expect(anyScreenHeadOn(item.aircraft, item.toleranceDeg * 2)).toBe(false)
      }
    }
  })

  it('mixes conflict and no-conflict items roughly evenly', () => {
    const s = generate('mix', 2)
    const conflicts = s.items.filter((i) => i.conflict).length
    expect(conflicts).toBe(Math.ceil(s.items.length / 2))
  })

  it('keeps aircraft separated and inside the field', () => {
    const s = generate('placement', 5)
    for (const item of s.items) {
      for (const a of item.aircraft) {
        expect(a.x).toBeGreaterThanOrEqual(8)
        expect(a.x).toBeLessThanOrEqual(92)
        expect(a.y).toBeGreaterThanOrEqual(8)
        expect(a.y).toBeLessThanOrEqual(92)
      }
      for (let i = 0; i < item.aircraft.length; i++) {
        for (let j = i + 1; j < item.aircraft.length; j++) {
          const dx = item.aircraft[i].x - item.aircraft[j].x
          const dy = item.aircraft[i].y - item.aircraft[j].y
          expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(16)
        }
      }
    }
  })
})

describe('conflict-scan scorer', () => {
  it('scores correct judgements', () => {
    const s = generate('sc', 1)
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 1500 }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})
