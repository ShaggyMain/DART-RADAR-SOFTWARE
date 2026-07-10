import type { Rng } from './rng'

/**
 * Procedural abstract glyphs: square boolean grids used as original stimuli
 * for perceptual-comparison and memory tasks (matching figures, pictograms,
 * rule symbols). All operations are pure.
 */
export interface Glyph {
  /** Grid side length. */
  size: number
  /** Row-major filled flags, length size*size. */
  cells: boolean[]
}

export function randomGlyph(rng: Rng, size: number, filled: number): Glyph {
  const total = size * size
  if (filled > total) throw new Error(`randomGlyph: filled (${filled}) > cells (${total})`)
  const indices = rng.sample(
    Array.from({ length: total }, (_, i) => i),
    filled
  )
  const cells = new Array<boolean>(total).fill(false)
  for (const i of indices) cells[i] = true
  return { size, cells }
}

/** Flip exactly `flips` distinct cells — guaranteed to differ from the input. */
export function mutateGlyph(rng: Rng, glyph: Glyph, flips: number): Glyph {
  const total = glyph.size * glyph.size
  if (flips < 1 || flips > total) throw new Error(`mutateGlyph: bad flips (${flips})`)
  const indices = rng.sample(
    Array.from({ length: total }, (_, i) => i),
    flips
  )
  const cells = glyph.cells.slice()
  for (const i of indices) cells[i] = !cells[i]
  return { size: glyph.size, cells }
}

/** Rotate clockwise by quarterTurns * 90°. */
export function rotateGlyph(glyph: Glyph, quarterTurns: number): Glyph {
  const n = glyph.size
  let src = glyph.cells
  const turns = ((quarterTurns % 4) + 4) % 4
  for (let t = 0; t < turns; t++) {
    const dst = new Array<boolean>(n * n).fill(false)
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        dst[r * n + c] = src[(n - 1 - c) * n + r]
      }
    }
    src = dst
  }
  return { size: n, cells: src }
}

/** Mirror horizontally (left-right flip). */
export function mirrorGlyph(glyph: Glyph): Glyph {
  const n = glyph.size
  const dst = new Array<boolean>(n * n).fill(false)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      dst[r * n + c] = glyph.cells[r * n + (n - 1 - c)]
    }
  }
  return { size: n, cells: dst }
}

export function glyphsEqual(a: Glyph, b: Glyph): boolean {
  return a.size === b.size && a.cells.every((v, i) => v === b.cells[i])
}

/** Stable string key, e.g. for uniqueness checks. */
export function glyphKey(g: Glyph): string {
  return `${g.size}:${g.cells.map((c) => (c ? '1' : '0')).join('')}`
}

/** True when the glyph equals `other` under any of the 4 rotations. */
export function equalUnderRotation(a: Glyph, b: Glyph): boolean {
  for (let t = 0; t < 4; t++) {
    if (glyphsEqual(rotateGlyph(a, t), b)) return true
  }
  return false
}
