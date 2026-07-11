import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import { score, type DartScenario } from './generator'
import { DartSim, type DartCommand } from './sim'

const SIZE = 560

export function RadarDartView({
  scenario,
  timingMultiplier: _timingMultiplier, // real-time pace IS the task
  onFinish
}: TaskViewProps<DartScenario>): React.JSX.Element {
  const simSpeed = useSettings((s) => s.settings.simSpeed)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<DartSim | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const [hud, setHud] = useState({ active: 0, conflicts: 0, handoffs: 0 })
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const simSpeedRef = useRef(simSpeed)
  simSpeedRef.current = simSpeed

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sim = new DartSim(scenario)
    simRef.current = sim
    const k = SIZE / scenario.sectorNm
    const px = (x: number): number => x * k
    const py = (y: number): number => SIZE - y * k

    const onClick = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * SIZE
      const my = ((e.clientY - rect.top) / rect.height) * SIZE
      let best: string | null = null
      let bestDist = 20
      for (const ac of sim.aircraft) {
        const d = Math.hypot(px(ac.x) - mx, py(ac.y) - my)
        if (d < bestDist) {
          bestDist = d
          best = ac.callsign
        }
      }
      setSelected(best)
    }
    canvas.addEventListener('mousedown', onClick)

    let hudTimer = 0
    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (dt, elapsed) => {
        sim.step(dt, simSpeedRef.current)
        hudTimer += dt
        if (hudTimer >= 250) {
          hudTimer = 0
          setRemainingMs(Math.max(0, scenario.durationMs - elapsed))
          setHud({
            active: sim.aircraft.length,
            conflicts: sim.conflictEpisodes,
            handoffs: sim.handoffCount
          })
        }
      },
      render: () => {
        ctx.fillStyle = '#0b1220'
        ctx.fillRect(0, 0, SIZE, SIZE)

        // range rings
        ctx.strokeStyle = '#1a2540'
        ctx.lineWidth = 1
        for (const r of [25, 50]) {
          ctx.beginPath()
          ctx.arc(SIZE / 2, SIZE / 2, r * k, 0, Math.PI * 2)
          ctx.stroke()
        }

        // fixes
        for (const f of scenario.fixes) {
          const isExit = f.x <= 5 || f.x >= 95 || f.y <= 5 || f.y >= 95
          ctx.fillStyle = isExit ? '#45d17e' : '#263353'
          ctx.beginPath()
          const fx = px(f.x)
          const fy = py(f.y)
          ctx.moveTo(fx, fy - 5)
          ctx.lineTo(fx + 5, fy + 4)
          ctx.lineTo(fx - 5, fy + 4)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = '#8fa0bf'
          ctx.font = '10px system-ui'
          ctx.fillText(f.id, fx + 7, fy + 3)
        }

        // conflict pair lines
        ctx.strokeStyle = '#e5604c'
        ctx.lineWidth = 1.5
        for (const pair of sim.conflictPairs) {
          const [a, b] = pair.split('|').map((cs) => sim.find(cs))
          if (!a || !b) continue
          ctx.beginPath()
          ctx.moveTo(px(a.x), py(a.y))
          ctx.lineTo(px(b.x), py(b.y))
          ctx.stroke()
        }

        const inConflictSet = new Set<string>()
        for (const pair of sim.conflictPairs) pair.split('|').forEach((cs) => inConflictSet.add(cs))
        const predictedSet = new Set<string>()
        for (const pair of sim.predictedPairs) pair.split('|').forEach((cs) => predictedSet.add(cs))

        for (const ac of sim.aircraft) {
          const x = px(ac.x)
          const y = py(ac.y)
          const color = inConflictSet.has(ac.callsign)
            ? '#e5604c'
            : predictedSet.has(ac.callsign)
              ? '#e0b34d'
              : '#39c0d4'

          // route line for the selected aircraft
          if (ac.callsign === selectedRef.current && !ac.vectored && ac.route.length > 0) {
            ctx.strokeStyle = '#1f7f8f'
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(x, y)
            for (const fixId of ac.route) {
              const f = scenario.fixes.find((ff) => ff.id === fixId)!
              ctx.lineTo(px(f.x), py(f.y))
            }
            ctx.stroke()
            ctx.setLineDash([])
          }

          // velocity leader: one minute of travel
          const leadNm = ac.speedKts / 60
          const rad = (ac.headingDeg * Math.PI) / 180
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + Math.sin(rad) * leadNm * k, y - Math.cos(rad) * leadNm * k)
          ctx.stroke()

          ctx.fillStyle = color
          ctx.fillRect(x - 4, y - 4, 8, 8)
          if (ac.callsign === selectedRef.current) {
            ctx.strokeStyle = '#dbe4f5'
            ctx.lineWidth = 1.5
            ctx.strokeRect(x - 7, y - 7, 14, 14)
          }

          // keep labels inside the scope near the edges
          const lx = x + 8 > SIZE - 88 ? x - 88 : x + 8
          let lyA = y - 8
          let lyB = y + 4
          if (y < 22) {
            lyA = y + 18
            lyB = y + 30
          } else if (y > SIZE - 14) {
            lyA = y - 22
            lyB = y - 10
          }
          ctx.fillStyle = '#dbe4f5'
          ctx.font = '11px system-ui'
          ctx.fillText(ac.callsign, lx, lyA)
          ctx.fillStyle = '#8fa0bf'
          ctx.fillText(
            `FL${Math.round(ac.altitudeFl)}${ac.vectored ? ' VEC' : ''} ${ac.exitFixId}`,
            lx,
            lyB
          )
        }
      },
      onDone: () => onFinish(score(scenario, sim.getLog()))
    })

    return () => {
      canvas.removeEventListener('mousedown', onClick)
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  const cmd = (c: DartCommand): void => {
    if (selected) simRef.current?.command(selected, c)
  }
  const selectedAc = selected ? simRef.current?.find(selected) : undefined

  return (
    <div className="sim-layout">
      <div style={{ maxWidth: SIZE, minWidth: 0 }}>
        <div className="progress" style={{ textAlign: 'left' }}>
          Keep everyone separated (5 NM / 1000 ft) and hand each flight off at its exit fix ·{' '}
          {Math.ceil(remainingMs / 1000)}s left
        </div>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Radar scope with aircraft, fixes and conflict warnings"
          width={SIZE}
          height={SIZE}
          style={{ borderRadius: 10, border: '1px solid var(--border)', maxWidth: '100%' }}
        />
      </div>
      <div className="sim-panel">
        <div className="sim-hud">
          <span>Active {hud.active}</span>
          <span style={{ color: hud.conflicts > 0 ? 'var(--bad)' : undefined }}>
            Conflicts {hud.conflicts}
          </span>
          <span>Handoffs {hud.handoffs}</span>
          <span title="Simulation speed (change in Settings)">{simSpeed}×</span>
        </div>
        <div className="sim-selected">
          {selectedAc ? (
            <>
              <strong>{selectedAc.callsign}</strong> · FL{Math.round(selectedAc.altitudeFl)} →{' '}
              {selectedAc.targetAltitudeFl} · {selectedAc.speedKts} kt · exit {selectedAc.exitFixId}
              {selectedAc.vectored ? ' · VECTORED' : ' · on route'}
            </>
          ) : (
            'Click an aircraft to select it'
          )}
        </div>
        <div className="cmd-grid">
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: -30 })}>
            ⟲ 30°
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: -10 })}>
            ⟲ 10°
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: 10 })}>
            ⟳ 10°
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: 30 })}>
            ⟳ 30°
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'altitude', deltaFl: 10 })}>
            Climb +10
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'altitude', deltaFl: -10 })}>
            Desc −10
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'speed', deltaKts: 20 })}>
            Spd +20
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'speed', deltaKts: -20 })}>
            Spd −20
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selectedAc}
            style={{ gridColumn: 'span 2' }}
            onClick={() => cmd({ type: 'resume' })}
          >
            Resume route
          </button>
        </div>
        <div className="traffic-list">
          {(simRef.current?.aircraft ?? []).map((ac) => (
            <button
              key={ac.callsign}
              type="button"
              className={`strip${selected === ac.callsign ? ' selected' : ''}`}
              onClick={() => setSelected(ac.callsign)}
            >
              <span className="cs">{ac.callsign}</span>
              <span className="meta">
                FL{Math.round(ac.altitudeFl)} → {ac.exitFixId}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
