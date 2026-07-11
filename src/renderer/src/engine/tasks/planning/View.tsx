import { useRef, useState } from 'react'
import { pointAtHeading } from '@shared/geometry'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import type { TaskViewProps } from '../taskView'
import {
  score,
  type PlanningItem,
  type PlanningResponseItem,
  type PlanningScenario
} from './generator'

const MAP = 320

function MapSvg({ item, picked }: { item: PlanningItem; picked: string[] }): React.JSX.Element {
  const c = MAP / 2
  const maxDist = Math.max(...item.aircraft.map((a) => a.distanceNm))
  return (
    <svg width={MAP} height={MAP} viewBox={`0 0 ${MAP} ${MAP}`}>
      <circle cx={c} cy={c} r={c - 8} fill="none" stroke="var(--border)" />
      <circle cx={c} cy={c} r={(c - 8) / 2} fill="none" stroke="var(--border)" strokeDasharray="4 4" />
      <rect x={c - 5} y={c - 12} width={10} height={24} fill="var(--good)" rx={2} />
      <text x={c + 12} y={c + 4} fill="var(--good)" fontSize={11}>
        RWY
      </text>
      {item.aircraft.map((a) => {
        const r = 26 + (a.distanceNm / maxDist) * (c - 48)
        const p = pointAtHeading({ x: 0, y: 0 }, a.bearingDeg, r)
        const x = c + p.x
        const y = c - p.y
        const isPicked = picked.includes(a.callsign)
        return (
          <g key={a.callsign} opacity={isPicked ? 0.35 : 1}>
            <polygon
              points={`${x},${y - 7} ${x + 6},${y + 6} ${x - 6},${y + 6}`}
              fill={a.lowFuel ? 'var(--bad)' : 'var(--accent)'}
            />
            <text
              x={x > MAP - 64 ? x - 9 : x + 9}
              y={y + 4}
              textAnchor={x > MAP - 64 ? 'end' : 'start'}
              fill="var(--text-dim)"
              fontSize={10}
            >
              {a.callsign}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function PlanningView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<PlanningScenario>): React.JSX.Element | null {
  const [itemIndex, setItemIndex] = useState(0)
  const [order, setOrder] = useState<string[]>([])
  const responsesRef = useRef<PlanningResponseItem[]>([])
  const startRef = useRef(performance.now())
  const finishedRef = useRef(false)

  const item = itemIndex < scenario.items.length ? scenario.items[itemIndex] : null
  const limitMs = item ? item.timeLimitMs * timingMultiplier : 0

  const submit = (finalOrder: string[]): void => {
    if (!item || finishedRef.current) return
    responsesRef.current.push({
      order: finalOrder,
      rtMs: performance.now() - startRef.current
    })
    if (itemIndex + 1 < scenario.items.length) {
      startRef.current = performance.now()
      setOrder([])
      setItemIndex(itemIndex + 1)
    } else {
      finishedRef.current = true
      onFinish(score(scenario, responsesRef.current))
    }
  }

  const remaining = useCountdown(item ? itemIndex : null, item ? limitMs : null, () =>
    submit(order)
  )

  if (!item) return null
  const complete = order.length === item.aircraft.length

  return (
    <div className="session" style={{ maxWidth: 1000 }}>
      <div className="progress">
        Puzzle {itemIndex + 1} / {scenario.items.length} — click the aircraft in landing order
      </div>
      <CountdownBar remainingMs={remaining} totalMs={limitMs} />
      <div className="planning-layout">
        <div className="rules-panel">
          <strong>Rules (in priority order)</strong>
          <ol>
            {item.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
        <MapSvg item={item} picked={order} />
        <div style={{ minWidth: 300 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Callsign</th>
                <th style={{ padding: '4px 8px' }}>Type</th>
                <th style={{ padding: '4px 8px' }}>Speed</th>
                <th style={{ padding: '4px 8px' }}>Dist</th>
                <th style={{ padding: '4px 8px' }}>Fuel</th>
              </tr>
            </thead>
            <tbody>
              {item.aircraft.map((a) => {
                const pickedPos = order.indexOf(a.callsign)
                return (
                  <tr
                    key={a.callsign}
                    tabIndex={pickedPos === -1 ? 0 : -1}
                    onClick={() => {
                      if (pickedPos === -1) setOrder([...order, a.callsign])
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && pickedPos === -1) {
                        e.preventDefault()
                        setOrder([...order, a.callsign])
                      }
                    }}
                    style={{
                      cursor: pickedPos === -1 ? 'pointer' : 'default',
                      opacity: pickedPos === -1 ? 1 : 0.45,
                      background: pickedPos === -1 ? 'var(--bg-panel)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                      {pickedPos >= 0 ? `${pickedPos + 1}. ` : ''}
                      {a.callsign}
                    </td>
                    <td style={{ padding: '6px 8px' }}>{a.type.toUpperCase()}</td>
                    <td style={{ padding: '6px 8px' }}>{a.speedKts} kt</td>
                    <td style={{ padding: '6px 8px' }}>{a.distanceNm} NM</td>
                    <td style={{ padding: '6px 8px', color: a.lowFuel ? 'var(--bad)' : undefined }}>
                      {a.lowFuel ? 'LOW' : 'ok'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="order-list">
            {order.map((cs, i) => (
              <span key={cs} className="order-chip">
                {i + 1}. {cs}
              </span>
            ))}
          </div>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn"
              disabled={order.length === 0}
              onClick={() => setOrder(order.slice(0, -1))}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!complete}
              onClick={() => submit(order)}
            >
              Confirm sequence
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
