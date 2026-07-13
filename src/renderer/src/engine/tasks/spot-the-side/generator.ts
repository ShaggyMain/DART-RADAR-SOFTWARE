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
 * Spot the Side — left/right perspective-taking. A person is shown facing
 * toward you, away from you, or standing sideways (profile), possibly rotated
 * in the image plane. Answer with the side FROM THE FIGURE'S PERSPECTIVE.
 *
 * Poses:
 *  - 'toward' / 'away': a shape next to each hand; facing you mirrors sides.
 *  - 'side-left' / 'side-right': profile view. Only ONE shape is visible, held
 *    in the near hand — the hand on the viewer's side of the body. A person
 *    facing screen-right shows you their RIGHT side (their right arm is the
 *    near one), so the visible hand is their right; facing screen-left it is
 *    their left.
 */
export type SideShape = 'circle' | 'square' | 'triangle' | 'diamond'
export type Hand = 'left' | 'right'
export type Facing = 'toward' | 'away' | 'side-left' | 'side-right'
export type RotationDeg = 0 | 90 | 180 | 270

export interface SpotSideItem {
  facing: Facing
  rotationDeg: RotationDeg
  targetShape: SideShape
  /** Second shape (the other hand). Not rendered in profile poses. */
  otherShape: SideShape
  /** Ground truth: the figure's hand that holds the target shape. */
  correctHand: Hand
  timeLimitMs: number
}

export interface SpotSideScenario extends ScenarioBase {
  taskId: 'spot-the-side'
  items: SpotSideItem[]
}

const SHAPES: readonly SideShape[] = ['circle', 'square', 'triangle', 'diamond']

export function isProfile(facing: Facing): boolean {
  return facing === 'side-left' || facing === 'side-right'
}

interface Config {
  items: number
  facings: readonly Facing[]
  rotations: readonly RotationDeg[]
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 14, facings: ['toward', 'away'], rotations: [0], timeLimitMs: 4000 },
  2: {
    items: 16,
    facings: ['toward', 'away', 'side-left', 'side-right'],
    rotations: [0],
    timeLimitMs: 3500
  },
  3: {
    items: 18,
    facings: ['toward', 'away', 'side-left', 'side-right'],
    rotations: [0, 180],
    timeLimitMs: 3200
  },
  4: {
    items: 20,
    facings: ['toward', 'away', 'side-left', 'side-right'],
    rotations: [0, 90, 180, 270],
    timeLimitMs: 3000
  },
  5: {
    items: 24,
    facings: ['toward', 'away', 'side-left', 'side-right'],
    rotations: [0, 90, 180, 270],
    timeLimitMs: 2200
  }
}

export type ScreenSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Where on screen the target shape appears. Shared by the view (to render)
 * and the tests (to validate the perspective logic).
 *
 * Body frame before rotation: seen from behind ('away') the figure's RIGHT
 * hand points screen-right; seen from the front ('toward') it points
 * screen-left. In profile the single visible shape is held in front of the
 * figure, i.e. on the side it faces. The whole image is then rotated
 * clockwise by rotationDeg.
 */
export function screenSideOfTarget(item: SpotSideItem): ScreenSide {
  let x: number
  if (isProfile(item.facing)) {
    x = item.facing === 'side-right' ? 1 : -1
  } else {
    const handSign = item.correctHand === 'right' ? 1 : -1
    const facingSign = item.facing === 'away' ? 1 : -1
    x = handSign * facingSign
  }
  let y = 0
  // Rotate clockwise by rotationDeg in screen space (y down):
  const turns = item.rotationDeg / 90
  for (let t = 0; t < turns; t++) {
    const nx = -y
    const ny = x
    x = nx
    y = ny
  }
  if (x === 1) return 'right'
  if (x === -1) return 'left'
  return y === 1 ? 'bottom' : 'top'
}

export function generate(seed: string, difficulty: Difficulty): SpotSideScenario {
  const rng = new Rng(`spot-the-side:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  // Balanced pose pool so the person visibly turns during every session,
  // instead of a random streak of one pose.
  const facings = rng.shuffle(
    Array.from({ length: cfg.items }, (_, i) => cfg.facings[i % cfg.facings.length])
  )
  const items: SpotSideItem[] = facings.map((facing) => {
    const [targetShape, otherShape] = rng.sample(SHAPES, 2)
    // Profile: the only visible hand is the near one — their right when facing
    // screen-right, their left when facing screen-left.
    const correctHand: Hand = isProfile(facing)
      ? facing === 'side-right'
        ? 'right'
        : 'left'
      : rng.bool()
        ? 'left'
        : 'right'
    return {
      facing,
      rotationDeg: rng.pick(cfg.rotations),
      targetShape,
      otherShape,
      correctHand,
      timeLimitMs: cfg.timeLimitMs
    }
  })
  return { taskId: 'spot-the-side', seed, difficulty, items }
}

/** Options order is fixed: [left, right]. */
export const SIDE_OPTIONS: readonly Hand[] = ['left', 'right']

export function score(scenario: SpotSideScenario, responses: ItemResponse[]): TaskResult {
  return scoreMultipleChoice(
    scenario.taskId,
    scenario.items.map((i) => SIDE_OPTIONS.indexOf(i.correctHand)),
    responses
  )
}

export const spotSideLogic: TaskLogic<SpotSideScenario, ItemResponse[]> = {
  taskId: 'spot-the-side',
  generate,
  score
}
