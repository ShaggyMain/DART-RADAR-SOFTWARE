import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import { speak, speechAvailable } from '@renderer/engine/core/speech'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import { score, type RadioCall, type RcLog, type RcScenario } from './generator'
import { RadarControlSim, type RcCommand } from './sim'

const SIZE = 560

interface PendingCall {
  call: RadioCall
  present: boolean
  deadlineMs: number
  acked: boolean
}

export function RadarControlView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<RcScenario>): React.JSX.Element {
  const audioEnabled = useSettings((s) => s.settings.audioEnabled)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<RadarControlSim | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const [hud, setHud] = useState({ active: 0, conflicts: 0, exits: 0 })
  const [radioText, setRadioText] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const ackRef = useRef<() => void>(() => undefined)
  const useAudio = audioEnabled && speechAvailable()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sim = new RadarControlSim(scenario)
    simRef.current = sim
    const k = SIZE / scenario.sectorNm
    const px = (x: number): number => x * k
    const py = (y: number): number => SIZE - y * k

    const audioLog: RcLog['audio'] = []
    let falseAcks = 0
    let pending: PendingCall | null = null
    let callCursor = 0
    const ackWindow = scenario.ackWindowMs * timingMultiplier

    const finalizePending = (): void => {
      if (pending) {
        audioLog.push({
          callsign: pending.call.callsign,
          present: pending.present,
          acked: pending.acked
        })
        pending = null
        setRadioText(null)
      }
    }

    const ack = (): void => {
      if (pending && !pending.acked) {
        pending.acked = true
      } else {
        falseAcks++
      }
    }

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
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        ack()
      }
    }
    canvas.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    ackRef.current = ack

    let hudTimer = 0
    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (dt, elapsed) => {
        sim.step(dt)

        if (pending && elapsed >= pending.deadlineMs) finalizePending()
        while (callCursor < scenario.calls.length && elapsed >= scenario.calls[callCursor].tMs) {
          finalizePending()
          const call = scenario.calls[callCursor++]
          pending = {
            call,
            present: sim.find(call.callsign) !== undefined,
            deadlineMs: elapsed + ackWindow,
            acked: false
          }
          if (useAudio) {
            speak(call.spoken, () => undefined, 1.1)
            setRadioText('📻 radio check…')
          } else {
            setRadioText(`📻 "${call.callsign}, radio check"`)
          }
        }

        hudTimer += dt
        if (hudTimer >= 250) {
          hudTimer = 0
          setRemainingMs(Math.max(0, scenario.durationMs - elapsed))
          setHud({ active: sim.aircraft.length, conflicts: sim.conflictEpisodes, exits: sim.exitCount })
        }
      },
      render: () => {
        ctx.fillStyle = '#0b1220'
        ctx.fillRect(0, 0, SIZE, SIZE)

        // corridor guides between opposite gates
        ctx.strokeStyle = '#16203a'
        ctx.lineWidth = 10
        ctx.beginPath()
        ctx.moveTo(px(50), py(3))
        ctx.lineTo(px(50), py(97))
        ctx.moveTo(px(3), py(50))
        ctx.lineTo(px(97), py(50))
        ctx.stroke()

        for (const g of scenario.gates) {
          ctx.fillStyle = '#45d17e'
          ctx.fillRect(px(g.x) - 5, py(g.y) - 5, 10, 10)
          ctx.fillStyle = '#8fa0bf'
          ctx.font = '10px system-ui'
          ctx.fillText(g.id, px(g.x) + 8, py(g.y) + 3)
        }

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
          ctx.fillText(`FL${Math.round(ac.altitudeFl)} → ${ac.gateId}`, lx, lyB)
        }
      },
      onDone: () => {
        finalizePending()
        onFinish(score(scenario, sim.buildLog(audioLog, falseAcks)))
      }
    })

    return () => {
      canvas.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  const cmd = (c: RcCommand): void => {
    if (selected) simRef.current?.command(selected, c)
  }
  const selectedAc = selected ? simRef.current?.find(selected) : undefined

  return (
    <div className="sim-layout">
      <div style={{ maxWidth: SIZE, minWidth: 0 }}>
        <div className="progress" style={{ textAlign: 'left' }}>
          Vector every flight to its assigned gate · press R (or ACK) only when a radio check
          names a flight on your scope · {Math.ceil(remainingMs / 1000)}s left
        </div>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Radar scope with aircraft, exit gates and corridors"
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
          <span>Exits {hud.exits}</span>
        </div>
        <div className="radio-box">
          {radioText ?? <span style={{ color: 'var(--text-dim)' }}>radio quiet</span>}
          <button type="button" className="btn" onClick={() => ackRef.current()}>
            ACK (R)
          </button>
        </div>
        <div className="sim-selected">
          {selectedAc ? (
            <>
              <strong>{selectedAc.callsign}</strong> · FL{Math.round(selectedAc.altitudeFl)} →{' '}
              {selectedAc.targetAltitudeFl} · {selectedAc.speedKts} kt · to {selectedAc.gateId}
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
                FL{Math.round(ac.altitudeFl)} → {ac.gateId}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
