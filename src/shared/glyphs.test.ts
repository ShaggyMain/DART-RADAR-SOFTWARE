import { describe, expect, it } from 'vitest'
import { Rng } from './rng'
import {
  equalUnderRotation,
  glyphKey,
  glyphsEqual,
  mirrorGlyph,
  mutateGlyph,
  randomGlyph,
  rotateGlyph,
  type Glyph
} from './glyphs'

describe('randomGlyph', () => {
  it('fills exactly the requested number of cells', () => {
    const rng = new Rng('g1')
    const g = randomGlyph(rng, 5, 9)
    expect(g.cells.filter(Boolean)).toHaveLength(9)
    expect(g.cells).toHaveLength(25)
  })

  it('is deterministic for the same seed', () => {
    const a = randomGlyph(new Rng('same'), 4, 6)
    const b = randomGlyph(new Rng('same'), 4, 6)
    expect(glyphsEqual(a, b)).toBe(true)
  })

  it('throws when filled exceeds grid size', () => {
    expect(() => randomGlyph(new Rng('x'), 2, 5)).toThrow()
  })
})

describe('mutateGlyph', () => {
  it('changes exactly k cells', () => {
    const rng = new Rng('m1')
    const g = randomGlyph(rng, 5, 10)
    for (const flips of [1, 2, 3]) {
      const m = mutateGlyph(rng, g, flips)
      const diff = m.cells.filter((v, i) => v !== g.cells[i]).length
      expect(diff).toBe(flips)
    }
  })

  it('always differs from the original', () => {
    const rng = new Rng('m2')
    const g = randomGlyph(rng, 4, 8)
    for (let i = 0; i < 20; i++) {
      expect(glyphsEqual(g, mutateGlyph(rng, g, 1))).toBe(false)
    }
  })
})

describe('rotateGlyph', () => {
  // L-shape in a 3x3 grid:  X..  /  X..  /  XX.
  const L: Glyph = {
    size: 3,
    cells: [true, false, false, true, false, false, true, true, false]
  }

  it('rotating 4 times returns the original', () => {
    expect(glyphsEqual(rotateGlyph(L, 4), L)).toBe(true)
  })

  it('rotates 90° clockwise correctly', () => {
    // CW: dest(r,c) = src(n-1-c, r) →  XXX / X.. / ...
    const expected: Glyph = {
      size: 3,
      cells: [true, true, true, true, false, false, false, false, false]
    }
    expect(glyphsEqual(rotateGlyph(L, 1), expected)).toBe(true)
  })

  it('normalizes negative turns', () => {
    expect(glyphsEqual(rotateGlyph(L, -1), rotateGlyph(L, 3))).toBe(true)
  })
})

describe('mirrorGlyph', () => {
  it('is its own inverse', () => {
    const g = randomGlyph(new Rng('mir'), 5, 11)
    expect(glyphsEqual(mirrorGlyph(mirrorGlyph(g)), g)).toBe(true)
  })

  it('flips columns', () => {
    const g: Glyph = { size: 2, cells: [true, false, false, false] }
    const m = mirrorGlyph(g)
    expect(m.cells).toEqual([false, true, false, false])
  })
})

describe('equalUnderRotation', () => {
  it('detects rotated copies', () => {
    const g = randomGlyph(new Rng('rot'), 4, 7)
    expect(equalUnderRotation(g, rotateGlyph(g, 2))).toBe(true)
  })

  it('rejects a mutated glyph (asymmetric case)', () => {
    const rng = new Rng('rot2')
    // High fill count in a 5x5 grid is almost never rotation-symmetric;
    // verify explicitly for this seed to keep the test honest.
    const g = randomGlyph(rng, 5, 9)
    const m = mutateGlyph(rng, g, 3)
    expect(equalUnderRotation(g, m)).toBe(false)
  })
})

describe('glyphKey', () => {
  it('is stable and distinguishes glyphs', () => {
    const rng = new Rng('key')
    const a = randomGlyph(rng, 4, 6)
    const b = mutateGlyph(rng, a, 1)
    expect(glyphKey(a)).toBe(glyphKey({ size: a.size, cells: a.cells.slice() }))
    expect(glyphKey(a)).not.toBe(glyphKey(b))
  })
})
