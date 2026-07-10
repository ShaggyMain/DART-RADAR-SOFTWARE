import { CountdownBar } from '@renderer/components/CountdownBar'
import { GlyphSvg } from '@renderer/components/GlyphSvg'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import { score, type MatchingFigureScenario } from './generator'

export function MatchingFigureView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<MatchingFigureScenario>): React.JSX.Element | null {
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
        <GlyphSvg glyph={item.reference} cell={20} color="var(--accent)" />
        <p className="question-text" style={{ margin: 0 }}>
          {item.rotationsAllowed
            ? 'Which figure is the same as the reference? (rotations allowed)'
            : 'Which figure is identical to the reference?'}
        </p>
      </div>
      <OptionButtons
        options={item.options.map((g, i) => (
          <GlyphSvg key={i} glyph={g} cell={13} />
        ))}
        onSelect={runner.answer}
      />
    </div>
  )
}
