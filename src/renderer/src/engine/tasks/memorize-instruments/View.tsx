import { useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import type { TaskViewProps } from '../taskView'
import {
  BATTERY_SEGMENTS,
  COMPASS_POINTS,
  GAUGE_SEGMENTS,
  formatReading,
  score,
  type Instrument,
  type InstrumentsScenario
} from './generator'

const ART = 120 // square drawing area of every instrument

// Readouts that imitate a lit display keep fixed colours (like a real panel)
// so digits stay legible whatever the app theme is.
const SCREEN = '#e9eff7'
const SCREEN_INK = '#16202e'

function CompassArt({ inst }: { inst: Instrument }): React.JSX.Element {
  const c = ART / 2
  const labels = COMPASS_POINTS.map((point, i) => {
    const a = ((i * 45) * Math.PI) / 180
    return (
      <text
        key={point}
        x={c + Math.sin(a) * 40}
        y={c - Math.cos(a) * 40 + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={i === 0 ? 'var(--accent)' : 'var(--text-dim)'}
      >
        {point}
      </text>
    )
  })
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      <circle cx={c} cy={c} r={50} fill="var(--bg-raised)" stroke="var(--border)" />
      <circle cx={c} cy={c} r={30} fill="none" stroke="var(--border)" strokeWidth={1} />
      {labels}
      {/* needle: filled half points at the reading, hollow half trails behind */}
      <g transform={`translate(${c}, ${c}) rotate(${inst.value * 45})`}>
        <polygon points="0,-26 7,0 -7,0" fill="var(--accent)" />
        <polygon points="0,26 7,0 -7,0" fill="var(--bg-panel)" stroke="var(--text-dim)" />
      </g>
      <circle cx={c} cy={c} r={3.5} fill="var(--text)" />
    </svg>
  )
}

function ThermometerArt({ inst }: { inst: Instrument }): React.JSX.Element {
  const top = 16
  const bottom = 92
  const x = 46
  const w = 13
  const yOf = (v: number): number =>
    bottom - ((v - inst.min) / (inst.max - inst.min)) * (bottom - top)
  const colTop = yOf(inst.value)

  const ticks: React.JSX.Element[] = []
  for (let v = inst.max; v >= inst.min; v -= 10) {
    const y = yOf(v)
    ticks.push(
      <g key={v}>
        <line x1={x + w + 2} y1={y} x2={x + w + 8} y2={y} stroke="var(--text-dim)" strokeWidth={1.5} />
        <text x={x + w + 12} y={y + 3} fontSize={8} fill="var(--text-dim)">
          {v}
        </text>
      </g>
    )
  }
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      {/* tube */}
      <rect x={x} y={top - 4} width={w} height={bottom - top + 12} rx={w / 2} fill={SCREEN} stroke="var(--border)" />
      {/* column from the bulb up to the reading */}
      <rect
        x={x + 2.5}
        y={colTop}
        width={w - 5}
        height={bottom - colTop + 10}
        rx={(w - 5) / 2}
        fill="var(--accent)"
      />
      <circle cx={x + w / 2} cy={100} r={11} fill="var(--accent)" stroke="var(--border)" />
      {ticks}
    </svg>
  )
}

function BatteryArt({ inst }: { inst: Instrument }): React.JSX.Element {
  const bodyX = 38
  const bodyY = 18
  const bodyW = 44
  const bodyH = 84
  const pad = 6
  const innerTop = bodyY + pad
  const innerH = bodyH - pad * 2
  const gap = 3
  const slotH = (innerH - gap * (BATTERY_SEGMENTS - 1)) / BATTERY_SEGMENTS

  const slots = Array.from({ length: BATTERY_SEGMENTS }, (_, i) => {
    // i counts from the bottom up, the way a battery fills
    const y = innerTop + innerH - (i + 1) * slotH - i * gap
    const on = i < inst.value
    return (
      <rect
        key={i}
        x={bodyX + pad}
        y={y}
        width={bodyW - pad * 2}
        height={slotH}
        rx={2}
        fill={on ? 'var(--accent)' : 'var(--bg-panel)'}
        stroke={on ? 'none' : 'var(--border)'}
      />
    )
  })
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      <rect x={bodyX + 14} y={bodyY - 6} width={16} height={7} rx={2} fill="var(--text-dim)" />
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={7}
        fill="var(--bg-raised)"
        stroke="var(--text-dim)"
        strokeWidth={3}
      />
      {slots}
    </svg>
  )
}

function ClockArt({ inst }: { inst: Instrument }): React.JSX.Element {
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      <rect x={10} y={38} width={100} height={44} rx={8} fill={SCREEN} stroke="var(--border)" />
      <text
        x={ART / 2}
        y={69}
        textAnchor="middle"
        fontSize={26}
        fontWeight={700}
        fill={SCREEN_INK}
        fontFamily="ui-monospace, 'Cascadia Mono', 'Consolas', monospace"
      >
        {formatReading(inst, inst.value)}
      </text>
    </svg>
  )
}

function SpeedLimitArt({ inst }: { inst: Instrument }): React.JSX.Element {
  const c = ART / 2
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      <circle cx={c} cy={c} r={44} fill="var(--accent)" />
      <circle cx={c} cy={c} r={34} fill={SCREEN} />
      <text x={c} y={c + 10} textAnchor="middle" fontSize={27} fontWeight={700} fill={SCREEN_INK}>
        {inst.value}
      </text>
    </svg>
  )
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function GaugeArt({ inst }: { inst: Instrument }): React.JSX.Element {
  const cx = ART / 2
  const cy = 80
  const r = 38
  const gapDeg = 5
  const span = 180 / GAUGE_SEGMENTS
  const segments = Array.from({ length: GAUGE_SEGMENTS }, (_, i) => {
    // SVG angles: 180° is left, 270° straight up, 360° right
    const a0 = 180 + i * span + gapDeg / 2
    const a1 = 180 + (i + 1) * span - gapDeg / 2
    const p0 = polar(cx, cy, r, a0)
    const p1 = polar(cx, cy, r, a1)
    const on = i < inst.value
    return (
      <path
        key={i}
        d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
        stroke={on ? 'var(--accent)' : 'var(--bg-raised)'}
        strokeWidth={16}
        fill="none"
      />
    )
  })
  return (
    <svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`}>
      {segments}
    </svg>
  )
}

function InstrumentArt({ inst }: { inst: Instrument }): React.JSX.Element {
  switch (inst.kind) {
    case 'compass':
      return <CompassArt inst={inst} />
    case 'thermometer':
      return <ThermometerArt inst={inst} />
    case 'battery':
      return <BatteryArt inst={inst} />
    case 'clock':
      return <ClockArt inst={inst} />
    case 'speedlimit':
      return <SpeedLimitArt inst={inst} />
    case 'gauge':
      return <GaugeArt inst={inst} />
  }
}

function InstrumentCard({ inst }: { inst: Instrument }): React.JSX.Element {
  return (
    <div
      className="instrument-card"
      role="img"
      aria-label={`${inst.name}: ${formatReading(inst, inst.value)}`}
    >
      <InstrumentArt inst={inst} />
      <div className="instrument-label">{inst.name}</div>
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
      <div className="session" style={{ maxWidth: 1000 }}>
        <div className="progress">
          Panel {panelIndex + 1} / {scenario.items.length} — memorize the readings!
        </div>
        <CountdownBar remainingMs={exposureRemaining} totalMs={exposureMs} />
        <div className="stimulus-box">
          <div className="instrument-panel">
            {item.instruments.map((inst, i) => (
              <InstrumentCard key={i} inst={inst} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const inst = item.instruments[query!.instrumentIndex]
  return (
    <div className="session">
      <div className="progress">
        Panel {panelIndex + 1} / {scenario.items.length} — question {queryIndex + 1} /{' '}
        {item.queries.length}
      </div>
      <CountdownBar remainingMs={queryRemaining} totalMs={queryLimitMs} />
      <div className="stimulus-box" style={{ minHeight: 140 }}>
        <p className="question-text" style={{ margin: 0 }}>
          What did the <strong>{inst.name}</strong> read?
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
