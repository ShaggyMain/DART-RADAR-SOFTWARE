import { useCallback, useEffect, useRef, useState } from 'react'
import { GlyphSvg } from '@renderer/components/GlyphSvg'
import { startLoop } from '@renderer/engine/core/gameLoop'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import {
  score,
  type EquationStim,
  type MAEvent,
  type MAKey,
  type MultiAttentionScenario,
  type ShapeStim
} from './generator'

function playBeep(ctx: AudioContext): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 880
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.25, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.2)
}

export function MultiAttentionView({
  scenario,
  timingMultiplier: _timingMultiplier, // continuous streams keep their own pace
  onFinish
}: TaskViewProps<MultiAttentionScenario>): React.JSX.Element {
  const audioEnabled = useSettings((s) => s.settings.audioEnabled)
  const [remainingMs, setRemainingMs] = useState(scenario.durationMs)
  const [shape, setShape] = useState<ShapeStim | null>(null)
  const [equation, setEquation] = useState<EquationStim | null>(null)
  const [beepFlash, setBeepFlash] = useState(false)
  const [pressed, setPressed] = useState<MAKey | null>(null)
  const eventsRef = useRef<MAEvent[]>([])
  const elapsedRef = useRef(0)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Both keys and mouse clicks funnel through here so they share one timeline.
  const pushEvent = useCallback((key: MAKey) => {
    eventsRef.current.push({ tMs: elapsedRef.current, key })
    setPressed(key)
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setPressed(null), 160)
  }, [])

  useEffect(() => {
    let audioCtx: AudioContext | null = null
    let beepCursor = 0
    let lastShape: ShapeStim | null = null
    let lastEquation: EquationStim | null = null

    const onKey = (e: KeyboardEvent): void => {
      const map: Record<string, MAKey> = { h: 'match', j: 'true', k: 'false', l: 'beep' }
      const key = map[e.key.toLowerCase()]
      if (key) {
        e.preventDefault()
        pushEvent(key)
      }
    }
    window.addEventListener('keydown', onKey)

    const handle = startLoop({
      durationMs: scenario.durationMs,
      update: (_dt, elapsed) => {
        elapsedRef.current = elapsed
        setRemainingMs(Math.max(0, scenario.durationMs - elapsed))

        const currentShape =
          scenario.shapes.find((s) => elapsed >= s.tMs && elapsed < s.tMs + s.durationMs) ?? null
        if (currentShape !== lastShape) {
          lastShape = currentShape
          setShape(currentShape)
        }
        const currentEq =
          scenario.equations.find((s) => elapsed >= s.tMs && elapsed < s.tMs + s.durationMs) ??
          null
        if (currentEq !== lastEquation) {
          lastEquation = currentEq
          setEquation(currentEq)
        }

        while (beepCursor < scenario.beeps.length && elapsed >= scenario.beeps[beepCursor].tMs) {
          if (audioEnabled) {
            audioCtx ??= new AudioContext()
            playBeep(audioCtx)
          } else {
            setBeepFlash(true)
            setTimeout(() => setBeepFlash(false), 450)
          }
          beepCursor++
        }
      },
      render: () => undefined,
      onDone: () => {
        window.removeEventListener('keydown', onKey)
        void audioCtx?.close()
        onFinish(score(scenario, eventsRef.current))
      }
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(pressTimer.current)
      void audioCtx?.close()
      handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, audioEnabled])

  const hasBeeps = scenario.beeps.length > 0
  const panelBase: React.CSSProperties = { minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }
  const flash = (key: MAKey): React.CSSProperties =>
    pressed === key ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : {}

  return (
    <div className="session" style={{ maxWidth: 1000 }}>
      <div className="progress">
        H = figures match · J = equation TRUE · K = equation FALSE
        {hasBeeps ? ' · L = sound heard' : ''} · {Math.ceil(remainingMs / 1000)}s left
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasBeeps ? '1fr 1fr 0.7fr' : '1fr 1fr',
          gap: 16
        }}
      >
        {/* FIGURES — click / H if the two figures match */}
        <div className="stimulus-box" style={{ ...panelBase, ...flash('match') }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>FIGURES</div>
          {shape ? (
            <div style={{ display: 'flex', gap: 26 }}>
              <GlyphSvg glyph={shape.left} cell={15} />
              <GlyphSvg glyph={shape.right} cell={15} />
            </div>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>—</span>
          )}
          <button type="button" className="ma-btn" onClick={() => pushEvent('match')}>
            Same <span className="ma-key">H</span>
          </button>
        </div>

        {/* EQUATION — click TRUE / FALSE (J / K) */}
        <div
          className="stimulus-box"
          style={{ ...panelBase, ...flash('true'), ...flash('false') }}
        >
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>EQUATION</div>
          {equation ? (
            <span style={{ fontSize: '1.9rem', fontWeight: 700 }}>{equation.text}</span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>—</span>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ma-btn" onClick={() => pushEvent('true')}>
              True <span className="ma-key">J</span>
            </button>
            <button type="button" className="ma-btn" onClick={() => pushEvent('false')}>
              False <span className="ma-key">K</span>
            </button>
          </div>
        </div>

        {hasBeeps && (
          <div className="stimulus-box" style={{ ...panelBase, ...flash('beep') }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>SOUND</div>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: beepFlash ? 'var(--warn)' : 'var(--bg-raised)',
                border: '1px solid var(--border)',
                transition: 'background 0.15s'
              }}
            />
            {!audioEnabled && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                audio off — watch the circle
              </div>
            )}
            <button type="button" className="ma-btn" onClick={() => pushEvent('beep')}>
              Beep <span className="ma-key">L</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
