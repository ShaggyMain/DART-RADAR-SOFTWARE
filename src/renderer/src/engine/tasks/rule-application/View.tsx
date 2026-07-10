import { CountdownBar } from '@renderer/components/CountdownBar'
import { GlyphSvg } from '@renderer/components/GlyphSvg'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import { score, type RuleScenario } from './generator'

export function RuleApplicationView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<RuleScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    onFinish: (responses) => onFinish(score(scenario, responses))
  })
  const item = runner.current
  if (!item) return null
  const phase = scenario.phases[item.phaseIndex]

  return (
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      {item.isPhaseStart && <div className="notice">RULES CHANGED — check the table!</div>}
      <div className="rule-table">
        {phase.mapping.map((pair, i) => (
          <div className="rule-pair" key={i}>
            <GlyphSvg glyph={pair.glyph} cell={9} />
            <span className="arrow">→</span>
            <span className="digit">{pair.digit}</span>
          </div>
        ))}
      </div>
      <div className="stimulus-box" style={{ minHeight: 160 }}>
        <GlyphSvg glyph={phase.mapping[item.pairIndex].glyph} cell={22} color="var(--accent)" />
        <p className="question-text" style={{ margin: 0 }}>
          Which digit belongs to this symbol?
        </p>
      </div>
      <OptionButtons
        options={item.options.map((d) => (
          <span key={d} style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {d}
          </span>
        ))}
        onSelect={runner.answer}
        keys={item.options.map(String)}
        keyLabels={item.options.map((d) => `key ${d}`)}
      />
    </div>
  )
}
