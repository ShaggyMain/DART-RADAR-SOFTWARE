import { useEffect, useState } from 'react'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import {
  CONFLICT_OPTIONS,
  score,
  type ConflictItem,
  type ConflictScanScenario
} from './generator'

const VIEW = 380

function FieldSvg({ item }: { item: ConflictItem }): React.JSX.Element {
  const s = VIEW / 100
  return (
    <svg width={VIEW} height={VIEW} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <rect x={0} y={0} width={VIEW} height={VIEW} fill="var(--bg)" rx={8} />
      {item.aircraft.map((a, i) => (
        <g key={i} transform={`translate(${a.x * s}, ${a.y * s}) rotate(${a.headingDeg})`}>
          <polygon points="0,-9 6,8 0,4 -6,8" fill="var(--accent)" />
        </g>
      ))}
    </svg>
  )
}

export function ConflictScanView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<ConflictScanScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    onFinish: (responses) => onFinish(score(scenario, responses))
  })
  const item = runner.current
  const [exposed, setExposed] = useState(true)

  useEffect(() => {
    if (!item) return
    setExposed(true)
    const timer = setTimeout(
      () => setExposed(false),
      item.exposureMs * timingMultiplier
    )
    return () => clearTimeout(timer)
  }, [item, runner.index, timingMultiplier])

  if (!item) return null

  return (
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total} — is any pair on a head-on collision course?
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      <div className="stimulus-box" style={{ minHeight: VIEW + 40 }}>
        {exposed ? (
          <FieldSvg item={item} />
        ) : (
          <div
            style={{
              width: VIEW,
              height: VIEW,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)'
            }}
          >
            Display hidden — answer now.
          </div>
        )}
      </div>
      <OptionButtons
        options={CONFLICT_OPTIONS.map((o) => (
          <span key={o}>{o}</span>
        ))}
        onSelect={runner.answer}
        keys={['c', 'n']}
        keyLabels={['C', 'N']}
      />
    </div>
  )
}
