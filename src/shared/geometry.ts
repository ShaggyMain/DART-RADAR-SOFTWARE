/**
 * Aviation-style geometry helpers. Generators work in math coordinates
 * (x east, y north / up); views are responsible for any screen-space flip.
 */
export interface Point {
  x: number
  y: number
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Normalize any angle in degrees to [0, 360). */
export function normalizeHeading(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

/**
 * Compass bearing from `from` to `to`: 0° = north (+y), 90° = east (+x),
 * increasing clockwise. Result in [0, 360).
 */
export function headingDeg(from: Point, to: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return normalizeHeading((Math.atan2(dx, dy) * 180) / Math.PI)
}

/**
 * Smallest signed turn from heading `from` to heading `to`, in degrees.
 * Positive = turn right (clockwise), negative = turn left. Range (-180, 180].
 */
export function signedTurn(from: number, to: number): number {
  let d = normalizeHeading(to) - normalizeHeading(from)
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Point at `dist` from origin along compass heading `hdg`. */
export function pointAtHeading(origin: Point, hdg: number, dist: number): Point {
  return {
    x: origin.x + Math.sin(degToRad(hdg)) * dist,
    y: origin.y + Math.cos(degToRad(hdg)) * dist
  }
}
