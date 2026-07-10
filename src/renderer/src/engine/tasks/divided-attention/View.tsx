import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import type { TaskViewProps } from '../taskView'
import {
  barCenterY,
  createPanelState,
  isInContact,
  score,
  stepPanel,
  type DividedAttentionScenario,
  type PanelPress,
  type PanelState
} from './generator'

const CANVAS_W = 720

export function DividedAttentionView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<DividedAttentionScenario>): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const pressesRef = useRef<PanelPress[]>([])

  const cols = Math.ceil(Math.sqrt(scenario.panels.length))
  const rows = Math.ceil(scenario.panels.length / cols)
  const cell = Math.floor(CANVAS_W / cols)
  const canvasH = rows * cell

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scored = {
      ...scenario,
      responseWindowMs: scenario.responseWindowMs * timingMultiplier
    }
    const states: PanelState[] = scenario.panels.map(createPanelState)
    const flashUntil = new Array<number>(scenario.panels.length).fill(-1)
    let elapsedNow = 0

    const press = (panel: number): void => {
      if (panel < 0 || panel >= scenario.panels.length) return
      pressesRef.current.push({ tMs: elapsedNow, panel })
      flashUntil[panel] = elapsedNow + 150
    }
    const onKey = (e: KeyboardEvent): void => {
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1) press(n - 1)
    }
    const onClick = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W
      const y = ((e.clientY - rect.top) / rect.height) * canvasH
      press(Math.floor(y / cell) * cols + Math.floor(x / cell))
    }
    window.addEventListener('keydown', onKey)
    canvas.addEventListener('mousedown', onClick)

    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (dt, elapsed) => {
        elapsedNow = elapsed
        scenario.panels.forEach((spec, i) => stepPanel(spec, states[i], dt))
        setRemainingMs(Math.max(0, scenario.durationMs - elapsed))
      },
      render: () => {
        ctx.clearRect(0, 0, CANVAS_W, canvasH)
        scenario.panels.forEach((spec, i) => {
          const px = (i % cols) * cell
          const py = Math.floor(i / cols) * cell
          const sc = (cell - 10) / 100
          const ox = px + 5
          const oy = py + 5

          ctx.fillStyle = '#0b1220'
          ctx.fillRect(ox, oy, cell - 10, cell - 10)
          const contact = isInContact(spec, states[i], scenario.contactTolerance)
          ctx.strokeStyle =
            elapsedNow < flashUntil[i] ? '#8fa0bf' : contact ? '#e0b34d' : '#263353'
          ctx.lineWidth = 2
          ctx.strokeRect(ox, oy, cell - 10, cell - 10)

          // bar
          const yc = barCenterY(spec.bar, states[i].elapsedMs)
          ctx.strokeStyle = '#e0b34d'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(ox + spec.bar.x * sc, oy + (yc - spec.bar.halfLen) * sc)
          ctx.lineTo(ox + spec.bar.x * sc, oy + (yc + spec.bar.halfLen) * sc)
          ctx.stroke()

          // dot
          ctx.beginPath()
          ctx.arc(ox + states[i].x * sc, oy + states[i].y * sc, 6, 0, Math.PI * 2)
          ctx.fillStyle = '#39c0d4'
          ctx.fill()

          // panel number
          ctx.fillStyle = '#8fa0bf'
          ctx.font = '600 13px system-ui'
          ctx.fillText(String(i + 1), ox + 8, oy + 20)
        })
      },
      onDone: () => {
        window.removeEventListener('keydown', onKey)
        onFinish(score(scored, pressesRef.current))
      }
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('mousedown', onClick)
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  return (
    <div className="session" style={{ maxWidth: CANVAS_W + 60 }}>
      <div className="progress">
        When the dot touches the bar, press that panel&apos;s number key (or click the panel) ·{' '}
        {Math.ceil(remainingMs / 1000)}s left
      </div>
      <div className="stimulus-box" style={{ minHeight: canvasH + 30 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={canvasH}
          style={{ borderRadius: 10, maxWidth: '100%' }}
        />
      </div>
    </div>
  )
}
