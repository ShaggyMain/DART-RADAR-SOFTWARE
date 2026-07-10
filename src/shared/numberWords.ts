/**
 * Integer → English words, used to build spoken stimuli (big-number recall,
 * callsign audio). Supports 0 … 999,999,999.
 */
const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
]

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety'
]

function belowThousand(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
  }
  if (n >= 20) {
    const tens = TENS[Math.floor(n / 10)]
    const rest = n % 10
    parts.push(rest ? `${tens}-${ONES[rest]}` : tens)
  } else if (n > 0) {
    parts.push(ONES[n])
  }
  return parts.join(' ')
}

export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) {
    throw new Error(`numberToWords: out of range (${n})`)
  }
  if (n === 0) return 'zero'
  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (millions) parts.push(`${belowThousand(millions)} million`)
  if (thousands) parts.push(`${belowThousand(thousands)} thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

/** 4370000 → "4,370,000" (en-US grouping). */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
