import { describe, expect, it } from 'vitest'
import { formatNumber, numberToWords } from './numberWords'

describe('numberToWords', () => {
  it('handles small numbers', () => {
    expect(numberToWords(0)).toBe('zero')
    expect(numberToWords(7)).toBe('seven')
    expect(numberToWords(13)).toBe('thirteen')
    expect(numberToWords(21)).toBe('twenty-one')
    expect(numberToWords(40)).toBe('forty')
  })

  it('handles hundreds', () => {
    expect(numberToWords(105)).toBe('one hundred five')
    expect(numberToWords(999)).toBe('nine hundred ninety-nine')
  })

  it('handles thousands and millions', () => {
    expect(numberToWords(1000)).toBe('one thousand')
    expect(numberToWords(52340)).toBe('fifty-two thousand three hundred forty')
    expect(numberToWords(9_000_000)).toBe('nine million')
    expect(numberToWords(4_370_000)).toBe('four million three hundred seventy thousand')
    expect(numberToWords(7_654_321)).toBe(
      'seven million six hundred fifty-four thousand three hundred twenty-one'
    )
  })

  it('rejects out-of-range input', () => {
    expect(() => numberToWords(-1)).toThrow()
    expect(() => numberToWords(1.5)).toThrow()
    expect(() => numberToWords(1_000_000_000)).toThrow()
  })
})

describe('formatNumber', () => {
  it('adds en-US thousands separators', () => {
    expect(formatNumber(4370000)).toBe('4,370,000')
    expect(formatNumber(999)).toBe('999')
  })
})
