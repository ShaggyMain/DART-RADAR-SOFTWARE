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
 * Spot the Side — left/right perspective-taking. A figure is shown facing
 * toward or away from the viewer, possibly rotated in the image plane, with
 * a shape in each hand. Answer with the side FROM THE FIGURE'S PERSPECTIVE.
 */
export type SideShape = 'circle' | 'square' | 'triangle' | 'diamond'
export type Hand = 'left' | 'right'
export type Facing = 'toward' | 'away'
export type RotationDeg = 0 | 90 | 180 | 270

export interface SpotSideItem {
  facing: Facing
  rotationDeg: RotationDeg
  targetShape: SideShape
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

interface Config {
  items: number
  facings: readonly Facing[]
  rotations: readonly RotationDeg[]
  timeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 14, facings: ['away'], rotations: [0], timeLimitMs: 4000 },
  2: { items: 16, facings: ['away', 'toward'], rotations: [0], timeLimitMs: 3500 },
  3: { items: 18, facings: ['away', 'toward'], rotations: [0, 180], timeLimitMs: 3200 },
  4: { items: 20, facings: ['away', 'toward'], rotations: [0, 90, 180, 270], timeLimitMs: 3000 },
  5: { items: 24, facings: ['away', 'toward'], rotations: [0, 90, 180, 270], timeLimitMs: 2200 }
}

export type ScreenSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Where on screen the target shape appears. Shared by the view (to render)
 * and the tests (to validate the perspective logic).
 *
 * In the figure's body frame, its RIGHT hand points screen-right when seen
 * from behind ('away') and screen-left when seen from the front ('toward');
 * the whole image is then rotated clockwise by rotationDeg.
 */
export function screenSideOfTarget(item: SpotSideItem): ScreenSide {
  const handSign = item.correctHand === 'right' ? 1 : -1
  const facingSign = item.facing === 'away' ? 1 : -1
  // Unit vector (x right, y down) before rotation:
  let x = handSign * facingSign
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
  const items: SpotSideItem[] = Array.from({ length: cfg.items }, () => {
    const [targetShape, otherShape] = rng.sample(SHAPES, 2)
    return {
      facing: rng.pick(cfg.facings),
      rotationDeg: rng.pick(cfg.rotations),
      targetShape,
      otherShape,
      correctHand: rng.bool() ? 'left' : 'right',
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
