import { useEffect, useRef, useState } from 'react'
import { startLoop } from '@renderer/engine/core/gameLoop'
import type { TaskViewProps } from '../taskView'
import { score, type PressEvent, type VigilanceScenario } from './generator'

const SIZE = 420

/**
 * Canvas-rendered sustained-attention task. The timing preset deliberately
 * does NOT stretch the rhythm (a vigilance task IS its pace); it only
 * widens the response window.
 */
export function VigilanceView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<VigilanceScenario>): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const pressesRef = useRef<PressEvent[]>([])
  const [pressCount, setPressCount] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const windowMs = scenario.responseWindowMs * timingMultiplier
    const scored = { ...scenario, responseWindowMs: windowMs }

    let markerIndex = 0
    let stepCursor = 0 // next step to apply
    let flashUntil = -1
    let elapsedNow = 0

    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault()
        pressesRef.current.push({ tMs: elapsedNow })
        setPressCount(pressesRef.current.length)
        flashUntil = elapsedNow + 120
      }
    }
    window.addEventListener('keydown', onKey)

    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (_dt, elapsed) => {
        elapsedNow = elapsed
        // apply due steps
        while (
          stepCursor < scenario.steps.length &&
          elapsed >= (stepCursor + 1) * scenario.stepIntervalMs
        ) {
          markerIndex =
            (markerIndex + (scenario.steps[stepCursor] ? 2 : 1)) % scenario.positions
          stepCursor++
        }
        setRemainingMs(Math.max(0, scenario.durationMs - elapsed))
      },
      render: () => {
        const c = SIZE / 2
        const radius = SIZE * 0.38
        ctx.clearRect(0, 0, SIZE, SIZE)
        ctx.fillStyle = '#0b1220'
        ctx.fillRect(0, 0, SIZE, SIZE)
        for (let i = 0; i < scenario.positions; i++) {
          const a = (i / scenario.positions) * Math.PI * 2 - Math.PI / 2
          const x = c + Math.cos(a) * radius
          const y = c + Math.sin(a) * radius
          ctx.beginPath()
          ctx.arc(x, y, i === markerIndex ? 11 : 5, 0, Math.PI * 2)
          ctx.fillStyle = i === markerIndex ? '#39c0d4' : '#263353'
          ctx.fill()
        }
        if (elapsedNow < flashUntil) {
          ctx.strokeStyle = '#8fa0bf'
          ctx.lineWidth = 3
          ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4)
        }
      },
      onDone: () => {
        window.removeEventListener('keydown', onKey)
        onFinish(score(scored, pressesRef.current))
      }
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  return (
    <div className="session">
      <div className="progress">
        Press SPACE when the marker makes a DOUBLE step · {Math.ceil(remainingMs / 1000)}s left ·{' '}
        {pressCount} presses
      </div>
      <div className="stimulus-box" style={{ minHeight: SIZE + 30 }}>
        <canvas ref={canvasRef} role="img" aria-label="Ring of positions with a stepping marker" width={SIZE} height={SIZE} style={{ borderRadius: 10 }} />
      </div>
    </div>
  )
}
