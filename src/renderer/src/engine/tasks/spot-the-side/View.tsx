import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import {
  SIDE_OPTIONS,
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

/**
 * A person seen from the FRONT (facing you: a face, an open collar and shirt
 * buttons) or from the BACK (turned away: no face, a nape of hair and a spine
 * seam). The whole figure is then rotated. Facing 'toward' mirrors the hands —
 * the figure's right hand appears on the viewer's left.
 */
function FigureSvg({ item }: { item: SpotSideItem }): React.JSX.Element {
  const toward = item.facing === 'toward'
  const facingSign = toward ? -1 : 1
  const handSign = item.correctHand === 'right' ? 1 : -1
  const targetX = handSign * facingSign * 64
  const line = { stroke: 'var(--text)', strokeWidth: 5, strokeLinecap: 'round' as const }
  const head = toward ? 'var(--bg-raised)' : 'var(--text)'

  return (
    <svg width={240} height={240} viewBox="-120 -120 240 240" aria-label="Person figure">
      <g transform={`rotate(${item.rotationDeg})`}>
        {/* head */}
        <circle cx={0} cy={-58} r={22} fill={head} stroke="var(--text)" strokeWidth={3} />
        {toward ? (
          // FRONT: eyes + smile
          <g fill="var(--text)">
            <circle cx={-8} cy={-62} r={3.4} />
            <circle cx={8} cy={-62} r={3.4} />
            <path d="M -8 -50 Q 0 -44 8 -50" stroke="var(--text)" strokeWidth={2.4} fill="none" />
          </g>
        ) : (
          // BACK: nape of hair, no face
          <path
            d="M -16 -50 Q 0 -40 16 -50"
            stroke="var(--bg-raised)"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
          />
        )}
        {/* shoulders + torso */}
        <path
          d="M -30 -30 L 30 -30 L 22 30 L -22 30 Z"
          fill="var(--bg-panel)"
          stroke="var(--text)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {toward ? (
          // FRONT: open collar V + two buttons
          <g stroke="var(--text)" strokeWidth={2.4} fill="none">
            <path d="M -10 -30 L 0 -18 L 10 -30" />
            <circle cx={0} cy={-6} r={2.6} fill="var(--text)" stroke="none" />
            <circle cx={0} cy={10} r={2.6} fill="var(--text)" stroke="none" />
          </g>
        ) : (
          // BACK: collar line + spine seam
          <g stroke="var(--text)" strokeWidth={2.4} fill="none">
            <path d="M -14 -26 L 14 -26" />
            <path d="M 0 -26 L 0 28" />
          </g>
        )}
        {/* arms out to the sides, ending in hands */}
        <line x1={-26} y1={-24} x2={-48} y2={-2} {...line} />
        <line x1={26} y1={-24} x2={48} y2={-2} {...line} />
        <circle cx={-48} cy={-2} r={6} fill="var(--text)" />
        <circle cx={48} cy={-2} r={6} fill="var(--text)" />
        {/* legs, so orientation stays readable when rotated */}
        <line x1={-12} y1={30} x2={-20} y2={66} {...line} />
        <line x1={12} y1={30} x2={20} y2={66} {...line} />
        {/* shapes just beyond each hand */}
        <Shape shape={item.targetShape} x={targetX} y={-2} />
        <Shape shape={item.otherShape} x={-targetX} y={-2} />
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

  return (
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      <div className="stimulus-box" style={{ minHeight: 260 }}>
        <FigureSvg item={item} />
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: item.facing === 'toward' ? 'var(--accent)' : 'var(--text-dim)'
          }}
        >
          {item.facing === 'toward' ? '▲ This person is FACING YOU' : '▼ This person has their BACK to you'}
        </div>
        <p className="question-text" style={{ margin: 0 }}>
          In which of the figure&apos;s hands is the{' '}
          <strong>{SHAPE_NAMES[item.targetShape]}</strong>?
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
