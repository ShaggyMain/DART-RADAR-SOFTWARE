import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import type { TaskViewProps } from '../taskView'
import { score, stripStateAt, type FlagEvent, type StripScenario } from './generator'

function fmtEta(etaMin: number): string {
  const totalS = Math.max(0, Math.round(etaMin * 60))
  return `${Math.floor(totalS / 60)}:${String(totalS % 60).padStart(2, '0')}`
}

export function StripManagementView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<StripScenario>): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0)
  const flagsRef = useRef<FlagEvent[]>([])
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const elapsedRef = useRef(0)

  useEffect(() => {
    let uiTimer = 0
    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (dt, e) => {
        elapsedRef.current = e
        uiTimer += dt
        if (uiTimer >= 200) {
          uiTimer = 0
          setElapsed(e)
        }
      },
      render: () => undefined,
      onDone: () =>
        onFinish(
          score(
            { ...scenario, flagWindowMs: scenario.flagWindowMs * timingMultiplier },
            flagsRef.current
          )
        )
    })
    return () => handle.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  const flag = (callsign: string): void => {
    flagsRef.current.push({ tMs: elapsedRef.current, callsign })
    setFlagged((prev) => new Set(prev).add(callsign))
  }

  const recentlyUpdated = new Set(
    scenario.updates
      .filter((u) => u.tMs <= elapsed && u.tMs > elapsed - 3000)
      .map((u) => u.callsign)
  )

  return (
    <div className="session" style={{ maxWidth: 1100 }}>
      <div className="progress">
        Flag every pair of strips at the SAME point, SAME level, with ETAs less than 3 minutes
        apart — click one strip of the pair · watch for level updates ·{' '}
        {Math.ceil(Math.max(0, scenario.durationMs - elapsed) / 1000)}s left
      </div>
      <div className="strip-columns">
        {scenario.points.map((point) => {
          const strips = scenario.flights
            .map((f) => ({ flight: f, state: stripStateAt(scenario, f, elapsed) }))
            .filter(({ flight, state }) => flight.pointId === point.id && state.present && flight.appearMs <= elapsed)
            .sort((a, b) => a.state.etaMin - b.state.etaMin)
          return (
            <div key={point.id} className="strip-column">
              <div className="strip-col-header">{point.name}</div>
              {strips.map(({ flight, state }) => (
                <button
                  key={flight.callsign}
                  type="button"
                  className={`flight-strip${flagged.has(flight.callsign) ? ' flagged' : ''}${recentlyUpdated.has(flight.callsign) ? ' updated' : ''}`}
                  onClick={() => flag(flight.callsign)}
                >
                  <span className="cs">{flight.callsign}</span>
                  <span className="fl">FL{state.fl}</span>
                  <span className="eta">{fmtEta(state.etaMin)}</span>
                </button>
              ))}
              {strips.length === 0 && <div className="strip-empty">—</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
