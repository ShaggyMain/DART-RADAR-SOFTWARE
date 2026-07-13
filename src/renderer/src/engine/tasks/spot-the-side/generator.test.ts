import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  generate,
  isProfile,
  score,
  screenSideOfTarget,
  type SpotSideItem
} from './generator'

const base: Omit<SpotSideItem, 'facing' | 'rotationDeg' | 'correctHand'> = {
  targetShape: 'circle',
  otherShape: 'square',
  timeLimitMs: 3000
}

describe('screenSideOfTarget (perspective logic)', () => {
  it('facing away, upright: figure right hand is on screen right', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'away', rotationDeg: 0, correctHand: 'right' })
    ).toBe('right')
    expect(
      screenSideOfTarget({ ...base, facing: 'away', rotationDeg: 0, correctHand: 'left' })
    ).toBe('left')
  })

  it('facing toward, upright: sides are mirrored', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'toward', rotationDeg: 0, correctHand: 'right' })
    ).toBe('left')
  })

  it('facing toward, rotated 180°: mirror + flip = screen side matches hand again', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'toward', rotationDeg: 180, correctHand: 'right' })
    ).toBe('right')
  })

  it('facing away, rotated 90° cw: right hand points down', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'away', rotationDeg: 90, correctHand: 'right' })
    ).toBe('bottom')
  })

  it('facing away, rotated 270° cw: right hand points up', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'away', rotationDeg: 270, correctHand: 'right' })
    ).toBe('top')
  })

  // Profile physics: someone walking to your right shows you their RIGHT side —
  // the near (visible) hand is their right, and the held shape is in front of
  // them, i.e. on the side they face.
  it('profile facing right: shape renders on screen right, held in the right hand', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'side-right', rotationDeg: 0, correctHand: 'right' })
    ).toBe('right')
  })

  it('profile facing left: shape renders on screen left, held in the left hand', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'side-left', rotationDeg: 0, correctHand: 'left' })
    ).toBe('left')
  })

  it('profile facing right, rotated 90° cw: shape points down', () => {
    expect(
      screenSideOfTarget({ ...base, facing: 'side-right', rotationDeg: 90, correctHand: 'right' })
    ).toBe('bottom')
  })
})

describe('spot-the-side generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 4)).toEqual(generate('s', 4))
  })

  it.each(DIFFICULTIES)('difficulty %i: uses only allowed facings/rotations', (d) => {
    const s = generate('cfg', d)
    for (const item of s.items) {
      if (d === 1) {
        expect(['toward', 'away']).toContain(item.facing)
        expect(item.rotationDeg).toBe(0)
      }
      if (d < 3) expect(item.rotationDeg).toBe(0)
      expect(item.targetShape).not.toBe(item.otherShape)
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: every allowed pose appears in a session', (d) => {
    const s = generate('poses', d)
    const seen = new Set(s.items.map((i) => i.facing))
    if (d === 1) {
      expect(seen).toEqual(new Set(['toward', 'away']))
    } else {
      expect(seen).toEqual(new Set(['toward', 'away', 'side-left', 'side-right']))
    }
  })

  it('profile items hold the shape in the near hand (matches facing side)', () => {
    const s = generate('profiles', 3)
    for (const item of s.items.filter((i) => isProfile(i.facing))) {
      expect(item.correctHand).toBe(item.facing === 'side-right' ? 'right' : 'left')
    }
  })

  it('produces both left and right answers', () => {
    const s = generate('mix', 3)
    const hands = new Set(s.items.map((i) => i.correctHand))
    expect(hands).toEqual(new Set(['left', 'right']))
  })
})

describe('spot-the-side scorer', () => {
  it('maps left/right options correctly', () => {
    const s = generate('score', 2)
    const responses = s.items.map((i) => ({
      answerIndex: i.correctHand === 'left' ? 0 : 1,
      rtMs: 700
    }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})
