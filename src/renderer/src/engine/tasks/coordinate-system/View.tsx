import { pointAtHeading, type Point } from '@shared/geometry'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import { formatHeading, score, type CoordItem, type CoordScenario } from './generator'

const VIEW = 340

function GridSvg({ item }: { item: CoordItem }): React.JSX.Element {
  const pad = 20
  const scale = (VIEW - 2 * pad) / item.gridSize
  const sx = (p: Point): number => pad + p.x * scale
  const sy = (p: Point): number => pad + (item.gridSize - p.y) * scale

  const lines: React.JSX.Element[] = []
  for (let i = 0; i <= item.gridSize; i++) {
    const v = pad + i * scale
    lines.push(
      <line key={`h${i}`} x1={pad} y1={v} x2={VIEW - pad} y2={v} stroke="var(--border)" />,
      <line key={`v${i}`} x1={v} y1={pad} x2={v} y2={VIEW - pad} stroke="var(--border)" />
    )
  }

  let courseArrow: React.JSX.Element | null = null
  if (item.kind === 'rotation' && item.currentHeading !== null) {
    const tip = pointAtHeading(item.a, item.currentHeading, item.gridSize * 0.28)
    courseArrow = (
      <g stroke="var(--warn)" strokeWidth={2}>
        <line x1={sx(item.a)} y1={sy(item.a)} x2={sx(tip)} y2={sy(tip)} />
        <circle cx={sx(tip)} cy={sy(tip)} r={3} fill="var(--warn)" stroke="none" />
      </g>
    )
  }

  return (
    <svg width={VIEW} height={VIEW} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      {lines}
      {courseArrow}
      <circle cx={sx(item.a)} cy={sy(item.a)} r={6} fill="var(--accent)" />
      <text x={sx(item.a) + 10} y={sy(item.a) - 8} fill="var(--accent)" fontSize={15} fontWeight={700}>
        A
      </text>
      <circle cx={sx(item.b)} cy={sy(item.b)} r={6} fill="var(--good)" />
      <text x={sx(item.b) + 10} y={sy(item.b) - 8} fill="var(--good)" fontSize={15} fontWeight={700}>
        B
      </text>
    </svg>
  )
}

function questionText(item: CoordItem): string {
  switch (item.kind) {
    case 'distance':
      return 'How far is B from A, in grid units?'
    case 'heading':
      return 'What is the compass heading from A to B? (north is up)'
    case 'rotation':
      return `You are at A on course ${formatHeading(item.currentHeading ?? 0)} (orange line). Which turn puts you on course to B?`
  }
}

export function CoordinateSystemView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<CoordScenario>): React.JSX.Element | null {
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
      <div className="stimulus-box">
        <GridSvg item={item} />
        <p className="question-text" style={{ margin: 0 }}>
          {questionText(item)}
        </p>
      </div>
      <OptionButtons
        options={item.options.map((o) => (
          <span key={o}>{o}</span>
        ))}
        onSelect={runner.answer}
      />
    </div>
  )
}
