import type { Rng } from '@shared/rng'

/** Letters that stay unambiguous next to digits (no I, O, Q). */
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'

const NATO: Record<string, string> = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
  G: 'Golf', H: 'Hotel', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike',
  N: 'November', P: 'Papa', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform',
  V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu'
}

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** 3 letters + 3 digits, e.g. "KDB937"; unique against `used`. */
export function makeCallsign(rng: Rng, used: Set<string>): string {
  for (let guard = 0; guard < 1000; guard++) {
    const cs =
      rng.pick([...LETTERS]) +
      rng.pick([...LETTERS]) +
      rng.pick([...LETTERS]) +
      String(rng.int(100, 999))
    if (!used.has(cs)) {
      used.add(cs)
      return cs
    }
  }
  throw new Error('makeCallsign: exhausted')
}

/** "KDB937" → "Kilo Delta Bravo nine three seven" (for TTS). */
export function phoneticCallsign(cs: string): string {
  return [...cs]
    .map((ch) => (ch >= '0' && ch <= '9' ? DIGITS[Number(ch)] : (NATO[ch] ?? ch)))
    .join(' ')
}
