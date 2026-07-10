import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import { speak, speechAvailable } from '@renderer/engine/core/speech'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import { score, type MpCall, type MpLog, type MpScenario } from './generator'
import { MultipassSim, type MpCommand } from './sim'

const SIZE = 540

interface PendingCall {
  call: MpCall
  present: boolean
  deadlineMs: number
  matched: boolean
}

export function MultipassView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<MpScenario>): React.JSX.Element {
  const audioEnabled = useSettings((s) => s.settings.audioEnabled)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<MultipassSim | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const [hud, setHud] = useState({ active: 0, conflicts: 0, landed: 0 })
  const [radioText, setRadioText] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const matchRef = useRef<() => void>(() => undefined)
  const useAudio = audioEnabled && speechAvailable()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sim = new MultipassSim(scenario, scenario.reportWindowMs * timingMultiplier)
    simRef.current = sim
    const k = SIZE / scenario.sectorNm
    const px = (x: number): number => x * k
    const py = (y: number): number => SIZE - y * k

    const audioLog: MpLog['audio'] = []
    let falseMatches = 0
    let pending: PendingCall | null = null
    let callCursor = 0
    const matchWindow = scenario.matchWindowMs * timingMultiplier

    const finalizePending = (): void => {
      if (pending) {
        audioLog.push({
          callsign: pending.call.callsign,
          present: pending.present,
          matched: pending.matched
        })
        pending = null
        setRadioText(null)
      }
    }
    const match = (): void => {
      if (pending && !pending.matched) pending.matched = true
      else falseMatches++
    }
    matchRef.current = match

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
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault()
        match()
      }
    }
    canvas.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)

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
            deadlineMs: elapsed + matchWindow,
            matched: false
          }
          if (useAudio) {
            speak(call.spoken, () => undefined, 1.1)
            setRadioText('🔊 callsign spoken — MATCH if on scope')
          } else {
            setRadioText(`🔊 "${call.callsign}" — MATCH if on scope`)
          }
        }

        hudTimer += dt
        if (hudTimer >= 250) {
          hudTimer = 0
          setRemainingMs(Math.max(0, scenario.durationMs - elapsed))
          setHud({
            active: sim.aircraft.length,
            conflicts: sim.conflictEpisodes,
            landed: sim.landedCount
          })
        }
      },
      render: () => {
        ctx.fillStyle = '#0b1220'
        ctx.fillRect(0, 0, SIZE, SIZE)

        for (const apt of scenario.airports) {
          const x = px(apt.x)
          const y = py(apt.y)
          ctx.strokeStyle = '#263353'
          ctx.beginPath()
          ctx.arc(x, y, scenario.landRadiusNm * k, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = '#45d17e'
          ctx.fillRect(x - 4, y - 14, 8, 28)
          ctx.fillStyle = '#dbe4f5'
          ctx.font = '700 14px system-ui'
          ctx.fillText(apt.id, x - 4, y + 34)
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

        for (const ac of sim.aircraft) {
          const x = px(ac.x)
          const y = py(ac.y)
          const color = inConflictSet.has(ac.callsign)
            ? '#e5604c'
            : ac.clearedTo
              ? '#39c0d4'
              : '#e0b34d'

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
          ctx.fillStyle = '#dbe4f5'
          ctx.font = '11px system-ui'
          ctx.fillText(ac.callsign, x + 8, y - 8)
          ctx.fillStyle = '#8fa0bf'
          ctx.fillText(
            `→${ac.destination}${ac.clearedTo ? ` CLR ${ac.clearedTo}` : ''}`,
            x + 8,
            y + 4
          )
        }
      },
      onDone: () => {
        finalizePending()
        onFinish(score(scenario, sim.buildLog(audioLog, falseMatches)))
      }
    })

    return () => {
      canvas.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  const cmd = (c: MpCommand): void => {
    if (selected) simRef.current?.command(selected, c)
  }
  const selectedAc = selected ? simRef.current?.find(selected) : undefined

  return (
    <div className="sim-layout">
      <div style={{ maxWidth: SIZE, minWidth: 0 }}>
        <div className="progress" style={{ textAlign: 'left' }}>
          Clear every arrival to its destination airport, keep 4 NM separation, acknowledge
          REPORT strips, press M for matching callsigns · {Math.ceil(remainingMs / 1000)}s left
        </div>
        <canvas
          ref={canvasRef}
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
          <span>Landed {hud.landed}</span>
        </div>
        <div className="radio-box">
          {radioText ?? <span style={{ color: 'var(--text-dim)' }}>radio quiet</span>}
          <button type="button" className="btn" onClick={() => matchRef.current()}>
            MATCH (M)
          </button>
        </div>
        <div className="sim-selected">
          {selectedAc ? (
            <>
              <strong>{selectedAc.callsign}</strong> · dest {selectedAc.destination} ·{' '}
              {selectedAc.clearedTo ? `cleared ${selectedAc.clearedTo}` : 'UNCLEARED'}
            </>
          ) : (
            'Click an aircraft or strip'
          )}
        </div>
        <div className="cmd-grid">
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'clear', airport: 'A' })}>
            Clear A
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'clear', airport: 'B' })}>
            Clear B
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: -30 })}>
            ⟲ 30°
          </button>
          <button type="button" className="btn" disabled={!selectedAc} onClick={() => cmd({ type: 'turn', deltaDeg: 30 })}>
            ⟳ 30°
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selectedAc}
            style={{ gridColumn: 'span 2' }}
            onClick={() => cmd({ type: 'resume' })}
          >
            Resume to cleared airport
          </button>
        </div>
        <div className="traffic-list">
          {(simRef.current?.aircraft ?? []).map((ac) => (
            <button
              key={ac.callsign}
              type="button"
              className={`strip${selected === ac.callsign ? ' selected' : ''}${ac.reportState === 'due' ? ' report' : ''}`}
              onClick={() => {
                setSelected(ac.callsign)
                simRef.current?.ackReport(ac.callsign)
              }}
            >
              <span className="cs">{ac.callsign}</span>
              <span className="meta">
                dest {ac.destination} ·{' '}
                {ac.reportState === 'due'
                  ? 'REPORT — click!'
                  : ac.clearedTo
                    ? `CLR ${ac.clearedTo}`
                    : 'uncleared'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
