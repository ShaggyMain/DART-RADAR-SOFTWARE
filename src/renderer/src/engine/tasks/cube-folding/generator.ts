import { Rng } from '@shared/rng'
import { scoreMultipleChoice } from '@shared/scoring'
import type {
  Difficulty,
  ItemResponse,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * Cube Folding — 3D visualisation. An unfolded cube net is shown next to
 * several folded-cube candidates (front/right/top faces visible); exactly
 * one candidate is a possible folding of the net.
 *
 * Implementation: the net is "folded" by rolling a virtual cube across the
 * net cells (BFS); enumerating all 24 cube orientations yields every valid
 * (front, right, top) triple. Distractors are triples proven invalid
 * against that set — including the classic mirror-image (chirality) trap.
 */

/** Original, 90°-rotation-invariant symbol ids (rendered by the view). */
export const SYMBOL_IDS = [
  'circle',
  'ring',
  'square',
  'frame',
  'diamond',
  'cross',
  'x',
  'dot4',
  'target'
] as const
export type SymbolId = (typeof SYMBOL_IDS)[number]

export type Dir = 'U' | 'D' | 'N' | 'S' | 'E' | 'W'
export type CubeMap<T> = Record<Dir, T>

export interface CubeView {
  front: SymbolId
  right: SymbolId
  top: SymbolId
}

export interface CubeFoldingItem {
  /** Net cell coordinates [x, y]; y grows downward (south) on screen. */
  netCells: [number, number][]
  /** Symbol per net cell, same order as netCells. */
  netSymbols: SymbolId[]
  options: CubeView[]
  correctIndex: number
  timeLimitMs: number
}

export interface CubeFoldingScenario extends ScenarioBase {
  taskId: 'cube-folding'
  items: CubeFoldingItem[]
}

/* ------------------------------------------------------------------ */
/* Folding mechanics                                                    */
/* ------------------------------------------------------------------ */

/** Cube rolls one cell east: the east face becomes the bottom, etc. */
function rollE<T>(m: CubeMap<T>): CubeMap<T> {
  return { U: m.W, D: m.E, E: m.U, W: m.D, N: m.N, S: m.S }
}
function rollW<T>(m: CubeMap<T>): CubeMap<T> {
  return { U: m.E, D: m.W, W: m.U, E: m.D, N: m.N, S: m.S }
}
function rollN<T>(m: CubeMap<T>): CubeMap<T> {
  return { U: m.S, D: m.N, N: m.U, S: m.D, E: m.E, W: m.W }
}
function rollS<T>(m: CubeMap<T>): CubeMap<T> {
  return { U: m.N, D: m.S, S: m.U, N: m.D, E: m.E, W: m.W }
}
/** Spin about the vertical axis (viewed from above, clockwise). */
function yaw<T>(m: CubeMap<T>): CubeMap<T> {
  return { U: m.U, D: m.D, E: m.N, S: m.E, W: m.S, N: m.W }
}

/**
 * Fold a net by rolling a cube over its cells. Returns the cube as a
 * direction→symbol map in the orientation the cube had on the first cell,
 * or null when the net is not a valid cube net.
 */
export function foldNet(
  cells: readonly [number, number][],
  symbols: readonly SymbolId[]
): CubeMap<SymbolId> | null {
  if (cells.length !== 6 || symbols.length !== 6) return null
  const key = (x: number, y: number): string => `${x},${y}`
  const cellIndex = new Map<string, number>()
  cells.forEach(([x, y], i) => {
    if (cellIndex.has(key(x, y))) return
    cellIndex.set(key(x, y), i)
  })
  if (cellIndex.size !== 6) return null

  // Body faces are abstract ids 0..5; identity orientation on the root cell.
  const identity: CubeMap<number> = { U: 0, D: 1, N: 2, S: 3, E: 4, W: 5 }
  const faceSymbols = new Array<SymbolId | null>(6).fill(null)

  const visited = new Set<number>([0])
  const queue: { index: number; orient: CubeMap<number> }[] = [
    { index: 0, orient: identity }
  ]
  faceSymbols[identity.D] = symbols[0]

  const moves: { dx: number; dy: number; roll: <T>(m: CubeMap<T>) => CubeMap<T> }[] = [
    { dx: 1, dy: 0, roll: rollE },
    { dx: -1, dy: 0, roll: rollW },
    { dx: 0, dy: 1, roll: rollS }, // y grows southward on screen
    { dx: 0, dy: -1, roll: rollN }
  ]

  while (queue.length > 0) {
    const { index, orient } = queue.shift()!
    const [x, y] = cells[index]
    for (const { dx, dy, roll } of moves) {
      const ni = cellIndex.get(key(x + dx, y + dy))
      if (ni === undefined || visited.has(ni)) continue
      visited.add(ni)
      const nOrient = roll(orient)
      const face = nOrient.D
      if (faceSymbols[face] !== null) return null // face folded onto twice
      faceSymbols[face] = symbols[ni]
      queue.push({ index: ni, orient: nOrient })
    }
  }

  if (visited.size !== 6 || faceSymbols.some((s) => s === null)) return null
  return {
    U: faceSymbols[identity.U]!,
    D: faceSymbols[identity.D]!,
    N: faceSymbols[identity.N]!,
    S: faceSymbols[identity.S]!,
    E: faceSymbols[identity.E]!,
    W: faceSymbols[identity.W]!
  }
}

const mapKey = (m: CubeMap<SymbolId>): string => `${m.U}|${m.D}|${m.N}|${m.S}|${m.E}|${m.W}`

/** All 24 rotations of a cube map. */
export function allOrientations(base: CubeMap<SymbolId>): CubeMap<SymbolId>[] {
  const seen = new Map<string, CubeMap<SymbolId>>([[mapKey(base), base]])
  const queue = [base]
  while (queue.length > 0) {
    const m = queue.shift()!
    for (const t of [rollE(m), rollN(m), yaw(m)]) {
      const k = mapKey(t)
      if (!seen.has(k)) {
        seen.set(k, t)
        queue.push(t)
      }
    }
  }
  return [...seen.values()]
}

const viewKey = (v: CubeView): string => `${v.front}|${v.right}|${v.top}`

/**
 * The (front, right, top) triple visible when a cube orientation is drawn in the
 * standard corner view. The net is drawn x-east / y-south and folded away from
 * the viewer, so when the S face is toward you and U is up, the face on your
 * RIGHT is the WEST face of the roll frame (verified against hand-folded nets).
 * Reading E here instead of W produces a left-right mirror image of every cube.
 */
function cornerView(m: CubeMap<SymbolId>): CubeView {
  return { front: m.S, right: m.W, top: m.U }
}

/** Every (front, right, top) triple visible in some orientation. */
export function validViews(base: CubeMap<SymbolId>): Set<string> {
  const set = new Set<string>()
  for (const m of allOrientations(base)) {
    set.add(viewKey(cornerView(m)))
  }
  return set
}

/* ------------------------------------------------------------------ */
/* Nets                                                                 */
/* ------------------------------------------------------------------ */

const COL4: [number, number][] = [
  [1, 0],
  [1, 1],
  [1, 2],
  [1, 3]
]

/** Candidate nets — each is verified foldable by unit tests. */
export const NETS: readonly (readonly [number, number][])[] = [
  [...COL4, [0, 1], [2, 1]], // classic cross
  [...COL4, [0, 0], [2, 0]],
  [...COL4, [0, 0], [2, 1]],
  [...COL4, [0, 0], [2, 2]],
  [...COL4, [0, 0], [2, 3]],
  [...COL4, [0, 1], [2, 2]],
  // staircase (2-3-1 style)
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [3, 2]
  ],
  // 3-3 offset rows
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 1],
    [4, 1]
  ]
]

/** Rotate/mirror net coordinates for variety, then normalize to origin. */
function transformNet(
  rng: Rng,
  net: readonly (readonly [number, number])[]
): [number, number][] {
  const turns = rng.int(0, 3)
  const mirror = rng.bool()
  let pts = net.map(([x, y]) => {
    let px = mirror ? -x : x
    let py = y
    for (let t = 0; t < turns; t++) {
      const nx = -py
      const ny = px
      px = nx
      py = ny
    }
    return [px, py] as [number, number]
  })
  const minX = Math.min(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  pts = pts.map(([x, y]) => [x - minX, y - minY])
  return pts
}

/* ------------------------------------------------------------------ */
/* Generation                                                           */
/* ------------------------------------------------------------------ */

interface Config {
  items: number
  optionCount: number
  timeLimitMs: number
  netPool: number // first N nets from NETS
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 6, optionCount: 4, timeLimitMs: 60000, netPool: 3 },
  2: { items: 7, optionCount: 4, timeLimitMs: 55000, netPool: 6 },
  3: { items: 7, optionCount: 5, timeLimitMs: 50000, netPool: NETS.length },
  4: { items: 8, optionCount: 6, timeLimitMs: 45000, netPool: NETS.length },
  5: { items: 8, optionCount: 6, timeLimitMs: 40000, netPool: NETS.length }
}

function opposite(base: CubeMap<SymbolId>, s: SymbolId): SymbolId {
  if (s === base.U) return base.D
  if (s === base.D) return base.U
  if (s === base.N) return base.S
  if (s === base.S) return base.N
  if (s === base.E) return base.W
  return base.E
}

function makeDistractors(
  rng: Rng,
  correct: CubeView,
  base: CubeMap<SymbolId>,
  valid: Set<string>,
  count: number,
  symbols: SymbolId[]
): CubeView[] {
  const used = new Set<string>([viewKey(correct)])
  const out: CubeView[] = []

  const tryAdd = (v: CubeView): boolean => {
    const parts = [v.front, v.right, v.top]
    if (new Set(parts).size !== 3) return false
    const k = viewKey(v)
    if (used.has(k) || valid.has(k)) return false
    used.add(k)
    out.push(v)
    return true
  }

  // 1. Mirror-image trap: swap front and right.
  tryAdd({ front: correct.right, right: correct.front, top: correct.top })

  // 2. Opposite-face substitutions (an opposite face can never be adjacent).
  const oppositeCandidates: CubeView[] = [
    { ...correct, top: opposite(base, correct.top) },
    { ...correct, right: opposite(base, correct.right) },
    { ...correct, front: opposite(base, correct.front) }
  ]
  for (const c of rng.shuffle(oppositeCandidates)) {
    if (out.length >= count) break
    tryAdd(c)
  }

  // 3. Random single-face substitutions until filled.
  let guard = 0
  while (out.length < count) {
    if (++guard > 1000) throw new Error('cube-folding: could not build distractors')
    const v = { ...correct }
    const slot = rng.int(0, 2)
    const replacement = rng.pick(symbols)
    if (slot === 0) v.front = replacement
    else if (slot === 1) v.right = replacement
    else v.top = replacement
    tryAdd(v)
  }
  return out.slice(0, count)
}

function makeItem(rng: Rng, cfg: Config): CubeFoldingItem {
  let guard = 0
  while (true) {
    if (++guard > 100) throw new Error('cube-folding: item generation failed')
    const netCells = transformNet(rng, NETS[rng.int(0, cfg.netPool - 1)])
    const netSymbols = rng.sample(SYMBOL_IDS as readonly SymbolId[], 6)
    const base = foldNet(netCells, netSymbols)
    if (!base) continue // should not happen for verified nets; be safe

    const valid = validViews(base)
    const orientations = allOrientations(base)
    const chosen = rng.pick(orientations)
    const correct: CubeView = cornerView(chosen)

    const distractors = makeDistractors(
      rng,
      correct,
      base,
      valid,
      cfg.optionCount - 1,
      netSymbols
    )
    const options = rng.shuffle([correct, ...distractors])
    return {
      netCells,
      netSymbols,
      options,
      correctIndex: options.findIndex((o) => viewKey(o) === viewKey(correct)),
      timeLimitMs: cfg.timeLimitMs
    }
  }
}

export function generate(seed: string, difficulty: Difficulty): CubeFoldingScenario {
  const rng = new Rng(`cube-folding:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  return {
    taskId: 'cube-folding',
    seed,
    difficulty,
    items: Array.from({ length: cfg.items }, () => makeItem(rng, cfg))
  }
}

export function score(scenario: CubeFoldingScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => i.correctIndex),
    responses
  )
}

export const cubeFoldingLogic: TaskLogic<CubeFoldingScenario, ItemResponse[]> = {
  taskId: 'cube-folding',
  generate,
  score
}
