import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  NUMBER_RANGES,
  SORT_COLOURS,
  SORT_SHAPES,
  categoriesFor,
  generate,
  messageText,
  rangeOf,
  resolveCategory,
  sameCategory,
  score,
  type SortObject
} from './generator'

describe('resolveCategory (rule engine)', () => {
  const red: SortObject = { kind: 'colour', shape: 'star', colour: 'red' }

  it('classifies a coloured shape by its colour', () => {
    expect(resolveCategory({ object: red, pairObject: null, message: null })).toEqual({
      type: 'colour',
      colour: 'red'
    })
  })

  it('classifies an outline shape by its shape', () => {
    const obj: SortObject = { kind: 'shape', shape: 'triangle' }
    expect(resolveCategory({ object: obj, pairObject: null, message: null })).toEqual({
      type: 'shape',
      shape: 'triangle'
    })
  })

  it('classifies a number by the range it falls in', () => {
    const obj: SortObject = { kind: 'number', value: 120 }
    expect(resolveCategory({ object: obj, pairObject: null, message: null })).toEqual({
      type: 'range',
      min: 101,
      max: 150
    })
  })

  it('a message remaps the matching attribute', () => {
    const green: SortObject = { kind: 'colour', shape: 'star', colour: 'green' }
    expect(
      resolveCategory({
        object: green,
        pairObject: null,
        message: { type: 'colour', from: 'green', to: 'blue' }
      })
    ).toEqual({ type: 'colour', colour: 'blue' })
  })

  it('a message about another attribute is ignored', () => {
    expect(
      resolveCategory({
        object: red,
        pairObject: null,
        message: { type: 'colour', from: 'green', to: 'blue' }
      })
    ).toEqual({ type: 'colour', colour: 'red' })
  })

  it('an identical pair wins over the rules AND over a message', () => {
    expect(
      resolveCategory({
        object: red,
        pairObject: { kind: 'colour', shape: 'star', colour: 'red' },
        message: { type: 'colour', from: 'red', to: 'blue' }
      })
    ).toEqual({ type: 'pair' })
  })

  it('a differing pair does not override the rules', () => {
    expect(
      resolveCategory({
        object: red,
        pairObject: { kind: 'colour', shape: 'star', colour: 'blue' },
        message: null
      })
    ).toEqual({ type: 'colour', colour: 'red' })
  })
})

describe('rangeOf', () => {
  it('covers 1..150 with no gaps and rejects outside values', () => {
    for (let v = 1; v <= 150; v++) expect(rangeOf(v)).toBeDefined()
    expect(rangeOf(50)).toEqual(NUMBER_RANGES[0])
    expect(rangeOf(51)).toEqual(NUMBER_RANGES[1])
    expect(() => rangeOf(0)).toThrow()
    expect(() => rangeOf(151)).toThrow()
  })
})

describe('categoriesFor', () => {
  it('offers every colour / shape / range, with Pair first when a pair is shown', () => {
    expect(categoriesFor('colour', false)).toHaveLength(SORT_COLOURS.length)
    expect(categoriesFor('shape', false)).toHaveLength(SORT_SHAPES.length)
    expect(categoriesFor('number', false)).toHaveLength(NUMBER_RANGES.length)
    expect(categoriesFor('colour', true)[0]).toEqual({ type: 'pair' })
  })
})

describe('category-sort generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 4)).toEqual(generate('s', 4))
  })

  it.each(DIFFICULTIES)('difficulty %i: every item is answerable and self-consistent', (d) => {
    const s = generate('items', d)
    for (const item of s.items) {
      // the marked answer must be exactly the category the rules resolve to
      const target = resolveCategory(item)
      expect(sameCategory(item.categories[item.correctIndex], target)).toBe(true)
      // exactly one box can be the answer
      expect(item.categories.filter((c) => sameCategory(c, target))).toHaveLength(1)
      expect(item.correctIndex).toBeGreaterThanOrEqual(0)
      expect(item.correctIndex).toBeLessThan(item.categories.length)
      // a Pair box is offered exactly when a pair object is shown
      expect(item.categories.some((c) => c.type === 'pair')).toBe(item.pairObject !== null)
      if (item.object.kind === 'number') expect(item.message).toBeNull()
    }
  })

  it('difficulty 1 is plain colour sorting: no pairs, no messages', () => {
    for (const item of generate('easy', 1).items) {
      expect(item.object.kind).toBe('colour')
      expect(item.pairObject).toBeNull()
      expect(item.message).toBeNull()
    }
  })

  it('the hardest level exercises pairs, messages and all three object kinds', () => {
    const s = generate('hard', 5)
    expect(s.items.some((i) => i.pairObject !== null)).toBe(true)
    expect(s.items.some((i) => i.message !== null)).toBe(true)
    expect(new Set(s.items.map((i) => i.object.kind))).toEqual(
      new Set(['colour', 'shape', 'number'])
    )
    // matching pairs really do occur, and they answer "Pair"
    const paired = s.items.filter((i) => i.categories[i.correctIndex].type === 'pair')
    expect(paired.length).toBeGreaterThan(0)
  })

  it('messages read as plain instructions', () => {
    expect(messageText({ type: 'colour', from: 'green', to: 'blue' })).toBe(
      'Classify green objects as blue'
    )
    expect(messageText({ type: 'shape', from: 'star', to: 'square' })).toBe(
      'Classify stars as squares'
    )
  })
})

describe('category-sort scorer', () => {
  it('scores chosen categories', () => {
    const s = generate('sc', 3)
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 900 }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})
