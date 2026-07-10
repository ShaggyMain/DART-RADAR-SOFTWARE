import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  NETS,
  SYMBOL_IDS,
  allOrientations,
  foldNet,
  generate,
  score,
  validViews,
  type SymbolId
} from './generator'

const SIX: SymbolId[] = SYMBOL_IDS.slice(0, 6) as SymbolId[]

describe('foldNet', () => {
  it.each(NETS.map((n, i) => [i, n] as const))('net #%i folds into a valid cube', (_i, net) => {
    const cube = foldNet(net as [number, number][], SIX)
    expect(cube).not.toBeNull()
    // every symbol used exactly once across the six faces
    const faces = [cube!.U, cube!.D, cube!.N, cube!.S, cube!.E, cube!.W]
    expect(new Set(faces).size).toBe(6)
    expect(new Set(faces)).toEqual(new Set(SIX))
  })

  it('folds the classic cross with known opposite pairs', () => {
    // cross: column (1,0)..(1,3) + (0,1),(2,1); rolling assigns opposite
    // faces to cells two apart in the column: (1,0)/(1,2) and (1,1)/(1,3)
    const net: [number, number][] = [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [0, 1],
      [2, 1]
    ]
    const cube = foldNet(net, SIX)!
    const oppositeOf = (s: SymbolId): SymbolId => {
      if (s === cube.U) return cube.D
      if (s === cube.D) return cube.U
      if (s === cube.N) return cube.S
      if (s === cube.S) return cube.N
      if (s === cube.E) return cube.W
      return cube.E
    }
    expect(oppositeOf(SIX[0])).toBe(SIX[2]) // (1,0) vs (1,2)
    expect(oppositeOf(SIX[1])).toBe(SIX[3]) // (1,1) vs (1,3)
    expect(oppositeOf(SIX[4])).toBe(SIX[5]) // (0,1) vs (2,1)
  })

  it('rejects an invalid net (2x2 block)', () => {
    const bad: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 0]
    ]
    expect(foldNet(bad, SIX)).toBeNull()
  })

  it('rejects a disconnected net', () => {
    const bad: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [4, 0],
      [5, 0],
      [6, 0]
    ]
    expect(foldNet(bad, SIX)).toBeNull()
  })
})

describe('allOrientations / validViews', () => {
  it('a cube has exactly 24 orientations and 24 distinct views', () => {
    const cube = foldNet(NETS[0] as [number, number][], SIX)!
    expect(allOrientations(cube)).toHaveLength(24)
    expect(validViews(cube).size).toBe(24)
  })

  it('opposite faces never appear together in a valid view', () => {
    const cube = foldNet(NETS[0] as [number, number][], SIX)!
    const opposites: [SymbolId, SymbolId][] = [
      [cube.U, cube.D],
      [cube.N, cube.S],
      [cube.E, cube.W]
    ]
    for (const key of validViews(cube)) {
      const faces = key.split('|')
      for (const [a, b] of opposites) {
        expect(faces.includes(a) && faces.includes(b)).toBe(false)
      }
    }
  })
})

describe('cube-folding generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)(
    'difficulty %i: exactly one option is a valid folding of the net',
    (d) => {
      const s = generate('valid', d)
      for (const item of s.items) {
        const cube = foldNet(item.netCells, item.netSymbols)
        expect(cube).not.toBeNull()
        const valid = validViews(cube!)
        const validOptions = item.options.filter((o) =>
          valid.has(`${o.front}|${o.right}|${o.top}`)
        )
        expect(validOptions).toHaveLength(1)
        const correct = item.options[item.correctIndex]
        expect(valid.has(`${correct.front}|${correct.right}|${correct.top}`)).toBe(true)
      }
    }
  )

  it.each(DIFFICULTIES)('difficulty %i: options are distinct and faces distinct', (d) => {
    const s = generate('opts', d)
    for (const item of s.items) {
      const keys = item.options.map((o) => `${o.front}|${o.right}|${o.top}`)
      expect(new Set(keys).size).toBe(keys.length)
      for (const o of item.options) {
        expect(new Set([o.front, o.right, o.top]).size).toBe(3)
      }
    }
  })

  it('net symbols are six distinct symbols', () => {
    const s = generate('sym', 2)
    for (const item of s.items) {
      expect(new Set(item.netSymbols).size).toBe(6)
    }
  })
})

describe('cube-folding scorer', () => {
  it('scores correct answers', () => {
    const s = generate('sc', 1)
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 15000 }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})
