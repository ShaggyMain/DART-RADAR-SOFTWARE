import { useEffect, useMemo, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import type { TaskViewProps } from '../taskView'
import {
  computeEpisodes,
  score,
  stripStateAt,
  type FlagEvent,
  type StripScenario
} from './generator'

function fmtEta(etaMin: number): string {
  const totalS = Math.max(0, Math.round(etaMin * 60))
  return `${Math.floor(totalS / 60)}:${String(totalS % 60).padStart(2, '0')}`
}

export function StripManagementView({
  scenario,
  timingMultiplier: _timingMultiplier, // live countdown IS the pace here
  onFinish
}: TaskViewProps<StripScenario>): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0)
  const flagsRef = useRef<FlagEvent[]>([])
  const elapsedRef = useRef(0)

  // Ground-truth conflict episodes, precomputed once (pure function).
  const episodes = useMemo(() => computeEpisodes(scenario), [scenario])
  const foundEpisodesRef = useRef<Set<number>>(new Set())
  /** Callsigns rendered green (both members of every found pair). */
  const [found, setFound] = useState<Set<string>>(new Set())
  const [foundCount, setFoundCount] = useState(0)
  const [falseCount, setFalseCount] = useState(0)
  /** Callsign that flashes red after a wrong click. */
  const [wrong, setWrong] = useState<string | null>(null)
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      onDone: () => onFinish(score(scenario, flagsRef.current))
    })
    return () => {
      handle.stop()
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  const flag = (callsign: string): void => {
    if (found.has(callsign)) return // pair already found — nothing to do
    const t = elapsedRef.current
    flagsRef.current.push({ tMs: t, callsign })

    const idx = episodes.findIndex(
      (ep) => (ep.a === callsign || ep.b === callsign) && t >= ep.startMs && t <= ep.endMs
    )
    if (idx >= 0 && !foundEpisodesRef.current.has(idx)) {
      // Correct: light up BOTH strips of the pair, permanently.
      foundEpisodesRef.current.add(idx)
      const ep = episodes[idx]
      setFound((prev) => new Set(prev).add(ep.a).add(ep.b))
      setFoundCount((n) => n + 1)
    } else if (idx === -1) {
      // Wrong: brief red flash + visible false-flag counter.
      setFalseCount((n) => n + 1)
      setWrong(callsign)
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current)
      wrongTimerRef.current = setTimeout(() => setWrong(null), 900)
    }
  }

  const recentlyUpdated = new Set(
    scenario.updates
      .filter((u) => u.tMs <= elapsed && u.tMs > elapsed - 3000)
      .map((u) => u.callsign)
  )

  return (
    <div className="session" style={{ maxWidth: 1100 }}>
      <div className="progress">
        Click a strip that CONFLICTS with another in its column (same point, same FL, ETAs &lt; 3
        min apart) — a correct click turns the whole pair green, a wrong one flashes red · found{' '}
        <strong style={{ color: 'var(--good)' }}>{foundCount}</strong> · false{' '}
        <strong style={{ color: falseCount > 0 ? 'var(--bad)' : undefined }}>{falseCount}</strong>{' '}
        · {Math.ceil(Math.max(0, scenario.durationMs - elapsed) / 1000)}s left
      </div>
      <div className="strip-columns">
        {scenario.points.map((point) => {
          const strips = scenario.flights
            .map((f) => ({ flight: f, state: stripStateAt(scenario, f, elapsed) }))
            .filter(
              ({ flight, state }) =>
                flight.pointId === point.id && state.present && flight.appearMs <= elapsed
            )
            .sort((a, b) => a.state.etaMin - b.state.etaMin)
          return (
            <div key={point.id} className="strip-column">
              <div className="strip-col-header">{point.name}</div>
              {strips.map(({ flight, state }) => (
                <button
                  key={flight.callsign}
                  type="button"
                  className={`flight-strip${found.has(flight.callsign) ? ' found' : ''}${wrong === flight.callsign ? ' wrong' : ''}${recentlyUpdated.has(flight.callsign) ? ' updated' : ''}`}
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
