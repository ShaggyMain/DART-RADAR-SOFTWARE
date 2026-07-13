import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import {
  SIDE_OPTIONS,
  isProfile,
  score,
  type SideShape,
  type SpotSideItem,
  type SpotSideScenario
} from './generator'

function Shape({
  shape,
  x,
  y,
  size = 26
}: {
  shape: SideShape
  x: number
  y: number
  size?: number
}): React.JSX.Element {
  const h = size / 2
  const color = 'var(--accent)'
  switch (shape) {
    case 'circle':
      return <circle cx={x} cy={y} r={h} fill={color} />
    case 'square':
      return <rect x={x - h} y={y - h} width={size} height={size} fill={color} />
    case 'triangle':
      return <polygon points={`${x},${y - h} ${x + h},${y + h} ${x - h},${y + h}`} fill={color} />
    case 'diamond':
      return <polygon points={`${x},${y - h} ${x + h},${y} ${x},${y + h} ${x - h},${y}`} fill={color} />
  }
}

// Original flat-style person, drawn in three poses. Colors are fixed (not
// theme variables) so the figure reads as a person on any background.
const SKIN = '#e6b48c'
const HAIR = '#2b241e'
const SHIRT = '#7d97b5'
const SHIRT_EDGE = '#5c748f'
const TROUSERS = '#5d6675'
const DARK = '#23272f'

/** Front view: face, tie and buttons — unmistakably looking at you. */
function FrontFigure({ item }: { item: SpotSideItem }): React.JSX.Element {
  const handSign = item.correctHand === 'right' ? 1 : -1
  const targetX = handSign * -1 * 84 // facing you: their right is on your left
  return (
    <g>
      {/* arms (T-pose) + hands */}
      <rect x={-56} y={-36} width={112} height={9} rx={4.5} fill={SHIRT} stroke={SHIRT_EDGE} />
      <circle cx={-60} cy={-31} r={6} fill={SKIN} />
      <circle cx={60} cy={-31} r={6} fill={SKIN} />
      {/* torso */}
      <path d="M -26 -40 L 26 -40 L 21 28 L -21 28 Z" fill={SHIRT} stroke={SHIRT_EDGE} />
      {/* tie */}
      <path d="M -6 -40 L 6 -40 L 0 -30 Z" fill="var(--accent)" />
      <path d="M -3 -31 L 3 -31 L 5 6 L 0 14 L -5 6 Z" fill="var(--accent)" />
      {/* belt, trousers, shoes */}
      <rect x={-21} y={28} width={42} height={6} fill={DARK} />
      <path d="M -20 34 L -4 34 L -6 74 L -19 74 Z" fill={TROUSERS} />
      <path d="M 20 34 L 4 34 L 6 74 L 19 74 Z" fill={TROUSERS} />
      <ellipse cx={-13} cy={78} rx={10} ry={4.5} fill={DARK} />
      <ellipse cx={13} cy={78} rx={10} ry={4.5} fill={DARK} />
      {/* neck + head with a clear face */}
      <rect x={-5} y={-48} width={10} height={9} fill={SKIN} />
      <circle cx={0} cy={-64} r={20} fill={SKIN} />
      <path d="M -20 -66 A 20 20 0 0 1 20 -66 L 20 -72 A 20 20 0 0 0 -20 -72 Z" fill={HAIR} />
      <path d="M -20 -66 Q -20 -78 -8 -83 Q -20 -80 -20 -66 Z" fill={HAIR} />
      <circle cx={-7} cy={-64} r={2.6} fill={DARK} />
      <circle cx={7} cy={-64} r={2.6} fill={DARK} />
      <path d="M -6 -54 Q 0 -49 6 -54" stroke={DARK} strokeWidth={2.2} fill="none" />
      {/* shapes next to each hand */}
      <Shape shape={item.targetShape} x={targetX} y={-31} />
      <Shape shape={item.otherShape} x={-targetX} y={-31} />
    </g>
  )
}

/** Back view: hair covers the whole head — no face, plain shirt back. */
function BackFigure({ item }: { item: SpotSideItem }): React.JSX.Element {
  const handSign = item.correctHand === 'right' ? 1 : -1
  const targetX = handSign * 84 // seen from behind: their right is on your right
  return (
    <g>
      <rect x={-56} y={-36} width={112} height={9} rx={4.5} fill={SHIRT} stroke={SHIRT_EDGE} />
      <circle cx={-60} cy={-31} r={6} fill={SKIN} />
      <circle cx={60} cy={-31} r={6} fill={SKIN} />
      <path d="M -26 -40 L 26 -40 L 21 28 L -21 28 Z" fill={SHIRT} stroke={SHIRT_EDGE} />
      {/* back yoke seam — no tie, no buttons */}
      <path d="M -24 -30 L 24 -30" stroke={SHIRT_EDGE} strokeWidth={2} />
      <rect x={-21} y={28} width={42} height={6} fill={DARK} />
      <path d="M -20 34 L -4 34 L -6 74 L -19 74 Z" fill={TROUSERS} />
      <path d="M 20 34 L 4 34 L 6 74 L 19 74 Z" fill={TROUSERS} />
      <ellipse cx={-13} cy={78} rx={10} ry={4.5} fill={DARK} />
      <ellipse cx={13} cy={78} rx={10} ry={4.5} fill={DARK} />
      {/* neck + head seen from behind: solid hair, no face */}
      <rect x={-5} y={-48} width={10} height={9} fill={SKIN} />
      <circle cx={0} cy={-64} r={20} fill={HAIR} />
      <path d="M -14 -49 Q 0 -44 14 -49 L 14 -46 Q 0 -42 -14 -46 Z" fill={HAIR} />
      <Shape shape={item.targetShape} x={targetX} y={-31} />
      <Shape shape={item.otherShape} x={-targetX} y={-31} />
    </g>
  )
}

/**
 * Profile view, drawn facing screen-right and mirrored for side-left. Only the
 * near arm and ONE shape are visible; the far arm is hidden behind the body.
 */
function SideFigure({ item }: { item: SpotSideItem }): React.JSX.Element {
  const mirror = item.facing === 'side-left'
  return (
    <g transform={mirror ? 'scale(-1, 1)' : undefined}>
      {/* far leg slightly behind, then near leg */}
      <path d="M -8 30 L 4 30 L 0 74 L -10 74 Z" fill={TROUSERS} opacity={0.75} />
      <ellipse cx={0} cy={78} rx={9} ry={4.5} fill={DARK} opacity={0.75} />
      <path d="M -2 30 L 10 30 L 8 74 L -3 74 Z" fill={TROUSERS} />
      <ellipse cx={8} cy={78} rx={10} ry={4.5} fill={DARK} />
      {/* narrow torso */}
      <path d="M -12 -40 L 12 -40 L 10 30 L -10 30 Z" fill={SHIRT} stroke={SHIRT_EDGE} />
      <rect x={-10} y={26} width={20} height={5} fill={DARK} />
      {/* near arm reaching forward, hand + the single visible shape */}
      <path
        d="M -2 -34 L 34 -16"
        stroke={SHIRT}
        strokeWidth={9}
        strokeLinecap="round"
      />
      <circle cx={38} cy={-14} r={6} fill={SKIN} />
      {/* neck + head in profile: nose and hair show the facing direction */}
      <rect x={-4} y={-48} width={9} height={9} fill={SKIN} />
      <circle cx={0} cy={-64} r={20} fill={SKIN} />
      {/* nose */}
      <path d="M 18 -62 L 26 -58 L 17 -54 Z" fill={SKIN} />
      {/* hair over the back half of the head */}
      <path d="M 6 -83 A 20 20 0 0 0 -13 -49 L -20 -58 A 20 20 0 0 1 6 -83 Z" fill={HAIR} />
      <path d="M 6 -83 A 20 20 0 0 1 20 -70 L 6 -76 Z" fill={HAIR} />
      <circle cx={10} cy={-64} r={2.6} fill={DARK} />
      <Shape shape={item.targetShape} x={62} y={-14} />
    </g>
  )
}

function FigureSvg({ item }: { item: SpotSideItem }): React.JSX.Element {
  return (
    <svg width={250} height={250} viewBox="-125 -125 250 250" aria-label="Person figure">
      <g transform={`rotate(${item.rotationDeg})`}>
        {item.facing === 'toward' ? (
          <FrontFigure item={item} />
        ) : item.facing === 'away' ? (
          <BackFigure item={item} />
        ) : (
          <SideFigure item={item} />
        )}
      </g>
    </svg>
  )
}

const SHAPE_NAMES: Record<SideShape, string> = {
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  diamond: 'diamond'
}

function facingCaption(item: SpotSideItem): { text: string; accent: boolean } {
  switch (item.facing) {
    case 'toward':
      return { text: '▲ This person is FACING YOU', accent: true }
    case 'away':
      return { text: '▼ This person has their BACK to you', accent: false }
    case 'side-right':
      return { text: '▶ Side view — the person faces RIGHT', accent: true }
    case 'side-left':
      return { text: '◀ Side view — the person faces LEFT', accent: true }
  }
}

export function SpotTheSideView({
  scenario,
  timingMultiplier,
  feedback,
  onFinish
}: TaskViewProps<SpotSideScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    feedbackMs: feedback ? 1200 : 0,
    onFinish: (responses) => onFinish(score(scenario, responses))
  })
  const item = runner.current
  if (!item) return null

  const correctIndex = SIDE_OPTIONS.indexOf(item.correctHand)
  const reveal = runner.reveal
  const markClass = reveal
    ? (i: number): string | undefined =>
        i === correctIndex ? 'correct' : i === reveal.answerIndex ? 'wrong' : undefined
    : undefined
  const caption = facingCaption(item)

  return (
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      <div className="stimulus-box" style={{ minHeight: 270 }}>
        <FigureSvg item={item} />
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: caption.accent ? 'var(--accent)' : 'var(--text-dim)'
          }}
        >
          {caption.text}
        </div>
        <p className="question-text" style={{ margin: 0 }}>
          {isProfile(item.facing) ? (
            <>
              In which hand is the person holding the{' '}
              <strong>{SHAPE_NAMES[item.targetShape]}</strong>?
            </>
          ) : (
            <>
              In which of the figure&apos;s hands is the{' '}
              <strong>{SHAPE_NAMES[item.targetShape]}</strong>?
            </>
          )}
        </p>
      </div>
      <OptionButtons
        options={[<span key="l">Left hand</span>, <span key="r">Right hand</span>]}
        onSelect={runner.answer}
        keys={['ArrowLeft', 'ArrowRight']}
        keyLabels={['←', '→']}
        disabled={!!reveal}
        markClass={markClass}
      />
      {reveal && (
        <p className="reveal-note">
          {reveal.answerIndex === correctIndex
            ? '✓ Correct'
            : `✗ It was the figure's ${item.correctHand} hand`}
        </p>
      )}
    </div>
  )
}
