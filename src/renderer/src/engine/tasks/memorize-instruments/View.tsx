import { useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import type { TaskViewProps } from '../taskView'
import { score, type Gauge, type InstrumentsScenario } from './generator'

function GaugeSvg({ gauge }: { gauge: Gauge }): React.JSX.Element {
  const size = 120
  const c = size / 2
  const r = size * 0.4
  const startAngle = -120
  const endAngle = 120
  const fraction = (gauge.value - gauge.min) / (gauge.max - gauge.min)
  const needleAngle = startAngle + fraction * (endAngle - startAngle)

  const tickCount = 9
  const ticks: React.JSX.Element[] = []
  for (let i = 0; i < tickCount; i++) {
    const a = ((startAngle + (i / (tickCount - 1)) * (endAngle - startAngle)) * Math.PI) / 180
    const x1 = c + Math.sin(a) * (r - 6)
    const y1 = c - Math.cos(a) * (r - 6)
    const x2 = c + Math.sin(a) * r
    const y2 = c - Math.cos(a) * r
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-dim)" strokeWidth={2} />)
  }

  const na = (needleAngle * Math.PI) / 180
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r + 8} fill="var(--bg-raised)" stroke="var(--border)" />
        {ticks}
        <line
          x1={c}
          y1={c}
          x2={c + Math.sin(na) * (r - 10)}
          y2={c - Math.cos(na) * (r - 10)}
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={c} cy={c} r={4} fill="var(--accent)" />
        <text x={c} y={size - 8} textAnchor="middle" fill="var(--text)" fontSize={13} fontWeight={700}>
          {gauge.name}
        </text>
        <text x={c - r * 0.87} y={c + r * 0.5 + 14} textAnchor="middle" fill="var(--text-dim)" fontSize={9}>
          {gauge.min}
        </text>
        <text x={c + r * 0.87} y={c + r * 0.5 + 14} textAnchor="middle" fill="var(--text-dim)" fontSize={9}>
          {gauge.max}
        </text>
      </svg>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
        {gauge.min}–{gauge.max} {gauge.unit}
      </div>
    </div>
  )
}

export function MemorizeInstrumentsView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<InstrumentsScenario>): React.JSX.Element | null {
  const [panelIndex, setPanelIndex] = useState(0)
  const [queryIndex, setQueryIndex] = useState<number | null>(null) // null = exposure
  const responsesRef = useRef<ItemResponse[]>([])
  const answerStartRef = useRef(0)
  const finishedRef = useRef(false)

  const item = panelIndex < scenario.items.length ? scenario.items[panelIndex] : null
  const exposureMs = item ? item.exposureMs * timingMultiplier : 0
  const query = item && queryIndex !== null ? item.queries[queryIndex] : null
  const queryLimitMs = query ? query.timeLimitMs * timingMultiplier : 0

  const advance = (answerIndex: number | null): void => {
    if (!item || queryIndex === null || finishedRef.current) return
    responsesRef.current.push({
      answerIndex,
      rtMs: performance.now() - answerStartRef.current
    })
    if (queryIndex + 1 < item.queries.length) {
      answerStartRef.current = performance.now()
      setQueryIndex(queryIndex + 1)
    } else if (panelIndex + 1 < scenario.items.length) {
      setPanelIndex(panelIndex + 1)
      setQueryIndex(null)
    } else {
      finishedRef.current = true
      onFinish(score(scenario, responsesRef.current))
    }
  }

  const exposureRemaining = useCountdown(
    item && queryIndex === null ? panelIndex : null,
    item && queryIndex === null ? exposureMs : null,
    () => {
      answerStartRef.current = performance.now()
      setQueryIndex(0)
    }
  )

  const queryRemaining = useCountdown(
    query ? `${panelIndex}-${queryIndex}` : null,
    query ? queryLimitMs : null,
    () => advance(null)
  )

  if (!item) return null

  if (queryIndex === null) {
    return (
      <div className="session">
        <div className="progress">
          Panel {panelIndex + 1} / {scenario.items.length} — memorize the readings!
        </div>
        <CountdownBar remainingMs={exposureRemaining} totalMs={exposureMs} />
        <div className="stimulus-box">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            {item.gauges.map((g, i) => (
              <GaugeSvg key={i} gauge={g} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const gauge = item.gauges[query!.gaugeIndex]
  return (
    <div className="session">
      <div className="progress">
        Panel {panelIndex + 1} / {scenario.items.length} — question {queryIndex + 1} /{' '}
        {item.queries.length}
      </div>
      <CountdownBar remainingMs={queryRemaining} totalMs={queryLimitMs} />
      <div className="stimulus-box" style={{ minHeight: 140 }}>
        <p className="question-text" style={{ margin: 0 }}>
          What did the <strong>{gauge.name}</strong> gauge read?
        </p>
      </div>
      <OptionButtons
        options={query!.options.map((o) => (
          <span key={o}>{o}</span>
        ))}
        onSelect={advance}
      />
    </div>
  )
}
