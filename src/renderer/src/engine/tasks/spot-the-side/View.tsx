import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import { score, type SideShape, type SpotSideItem, type SpotSideScenario } from './generator'

function Shape({ shape, x, y, size = 26 }: { shape: SideShape; x: number; y: number; size?: number }): React.JSX.Element {
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
 * Stick figure holding a shape in each hand, drawn in its body frame and
 * rotated as a whole. Facing 'toward' mirrors the hands (the figure's right
 * hand appears on the viewer's left).
 */
function FigureSvg({ item }: { item: SpotSideItem }): React.JSX.Element {
  const facingSign = item.facing === 'away' ? 1 : -1
  const handSign = item.correctHand === 'right' ? 1 : -1
  const targetX = handSign * facingSign * 62
  const line = { stroke: 'var(--text)', strokeWidth: 5, strokeLinecap: 'round' as const }

  return (
    <svg width={220} height={220} viewBox="-110 -110 220 220">
      <g transform={`rotate(${item.rotationDeg})`}>
        {/* head */}
        <circle cx={0} cy={-52} r={18} fill={item.facing === 'toward' ? 'var(--bg-raised)' : 'var(--text)'} stroke="var(--text)" strokeWidth={3} />
        {item.facing === 'toward' && (
          <g fill="var(--text)">
            <circle cx={-6} cy={-56} r={2.8} />
            <circle cx={6} cy={-56} r={2.8} />
            <path d="M -6 -46 Q 0 -41 6 -46" stroke="var(--text)" strokeWidth={2} fill="none" />
          </g>
        )}
        {/* body */}
        <line x1={0} y1={-34} x2={0} y2={28} {...line} />
        {/* arms out to the sides */}
        <line x1={0} y1={-18} x2={-40} y2={-2} {...line} />
        <line x1={0} y1={-18} x2={40} y2={-2} {...line} />
        {/* legs, so orientation stays readable upside-down */}
        <line x1={0} y1={28} x2={-18} y2={62} {...line} />
        <line x1={0} y1={28} x2={18} y2={62} {...line} />
        {/* shapes next to each hand */}
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
  onFinish
}: TaskViewProps<SpotSideScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    onFinish: (responses) => onFinish(score(scenario, responses))
  })
  const item = runner.current
  if (!item) return null

  return (
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      <div className="stimulus-box" style={{ minHeight: 240 }}>
        <FigureSvg item={item} />
        <p className="question-text" style={{ margin: 0 }}>
          In which of the figure&apos;s hands is the <strong>{SHAPE_NAMES[item.targetShape]}</strong>?
        </p>
      </div>
      <OptionButtons
        options={[<span key="l">Left hand</span>, <span key="r">Right hand</span>]}
        onSelect={runner.answer}
        keys={['ArrowLeft', 'ArrowRight']}
        keyLabels={['←', '→']}
      />
    </div>
  )
}
