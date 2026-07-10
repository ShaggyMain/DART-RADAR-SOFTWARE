import { useMemo, useRef, useState } from 'react'

export interface TrendPoint {
  label: string
  value: number
}

interface Props {
  title: string
  points: TrendPoint[]
  yFormat: (v: number) => string
  color: string
  /** Fixed y domain; defaults to [0, max * 1.15]. */
  yDomain?: [number, number]
}

const W = 560
const H = 200
const PAD = { l: 48, r: 14, t: 14, b: 26 }

/**
 * Single-series line chart (SVG, no deps): thin 2px line, recessive grid,
 * crosshair + tooltip on hover. One measure per chart — never dual-axis.
 */
export function TrendChart({ title, points, yFormat, color, yDomain }: Props): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { xs, ys, y0, y1 } = useMemo(() => {
    const [lo, hi] = yDomain ?? [0, Math.max(1e-9, ...points.map((p) => p.value)) * 1.15]
    const innerW = W - PAD.l - PAD.r
    const innerH = H - PAD.t - PAD.b
    const xs = points.map((_, i) =>
      points.length === 1 ? PAD.l + innerW / 2 : PAD.l + (i / (points.length - 1)) * innerW
    )
    const ys = points.map((p) => PAD.t + innerH - ((p.value - lo) / (hi - lo)) * innerH)
    return { xs, ys, y0: lo, y1: hi }
  }, [points, yDomain])

  const gridLines = 4
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')

  const onMove = (e: React.MouseEvent<SVGRectElement>): void => {
    if (points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - fx) < Math.abs(xs[best] - fx)) best = i
    }
    setHover(best)
  }

  const hoverPoint = hover !== null && points[hover] ? { x: xs[hover], y: ys[hover], p: points[hover] } : null

  return (
    <div className="chart-card" ref={wrapRef}>
      <div className="chart-title">{title}</div>
      {points.length === 0 ? (
        <div className="chart-empty">No data yet.</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
            {Array.from({ length: gridLines + 1 }, (_, i) => {
              const gy = PAD.t + (i / gridLines) * (H - PAD.t - PAD.b)
              const gv = y1 - (i / gridLines) * (y1 - y0)
              return (
                <g key={i}>
                  <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--border)" strokeWidth={1} />
                  <text x={PAD.l - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="var(--text-dim)">
                    {yFormat(gv)}
                  </text>
                </g>
              )
            })}
            {/* x labels: first / last */}
            <text x={PAD.l} y={H - 8} fontSize={11} fill="var(--text-dim)">
              {points[0].label}
            </text>
            {points.length > 1 && (
              <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={11} fill="var(--text-dim)">
                {points[points.length - 1].label}
              </text>
            )}
            {hoverPoint && (
              <line
                x1={hoverPoint.x}
                y1={PAD.t}
                x2={hoverPoint.x}
                y2={H - PAD.b}
                stroke="var(--text-dim)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {xs.map((x, i) => (
              <circle key={i} cx={x} cy={ys[i]} r={points.length > 40 ? 0 : 3} fill={color} />
            ))}
            {hoverPoint && (
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r={5.5}
                fill={color}
                stroke="var(--bg-panel)"
                strokeWidth={2}
              />
            )}
            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
          {hoverPoint && (
            <div
              className="chart-tooltip"
              style={{
                left: `${(hoverPoint.x / W) * 100}%`,
                top: `${(hoverPoint.y / H) * 100}%`
              }}
            >
              <div className="tt-label">{hoverPoint.p.label}</div>
              <div className="tt-value">{yFormat(hoverPoint.p.value)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
