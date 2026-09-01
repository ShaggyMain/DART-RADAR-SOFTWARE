import { useRef, useState } from 'react'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import type { TaskViewProps } from '../taskView'
import { score, type RecallAnswer, type RecallShape, type ShapeRecallScenario } from './generator'

// Mid-edge slots: the corners sit exactly on the diagonals, which would draw a
// line straight through a dot. Top/right/bottom/left stay clear of both
// diagonals and of both chord heights.
const DOT_XY: readonly { x: number; y: number }[] = [
  { x: 50, y: 22 },
  { x: 78, y: 50 },
  { x: 50, y: 78 },
  { x: 22, y: 50 }
]

/** Compound figure: outer frame, optional diagonal, optional chord and 1–2 dots. */
function ShapeArt({ shape, size = 92 }: { shape: RecallShape; size?: number }): React.JSX.Element {
  const stroke = { stroke: 'var(--text)', strokeWidth: 3, fill: 'none' as const }
  const inset = 18
  // a chord has to stop at the outline, which is narrower on a circle
  const chordHalf = (y: number): number =>
    shape.outer === 'circle' ? Math.sqrt(Math.max(0, 46 * 46 - (y - 50) ** 2)) : 40
  const chordY = shape.chord === 'top' ? 32 : 68

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shape.outer === 'circle' ? (
        <circle cx={50} cy={50} r={46} {...stroke} />
      ) : (
        <rect x={6} y={6} width={88} height={88} rx={3} {...stroke} />
      )}
      {shape.diagonal === 'tlbr' && (
        <line x1={inset} y1={inset} x2={100 - inset} y2={100 - inset} {...stroke} />
      )}
      {shape.diagonal === 'trbl' && (
        <line x1={100 - inset} y1={inset} x2={inset} y2={100 - inset} {...stroke} />
      )}
      {shape.chord !== 'none' && (
        <line
          x1={50 - chordHalf(chordY)}
          y1={chordY}
          x2={50 + chordHalf(chordY)}
          y2={chordY}
          {...stroke}
        />
      )}
      {shape.dots.map((slot) => (
        <circle key={slot} cx={DOT_XY[slot].x} cy={DOT_XY[slot].y} r={8} {...stroke} />
      ))}
    </svg>
  )
}

type Phase =
  | { kind: 'study'; round: number; index: number }
  | { kind: 'calc'; round: number; index: number }
  | { kind: 'grid'; round: number }

export function ShapeRecallView({
  scenario,
  timingMultiplier,
  feedback,
  onFinish
}: TaskViewProps<ShapeRecallScenario>): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>({ kind: 'study', round: 0, index: 0 })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState(false)
  const answersRef = useRef<RecallAnswer[]>([])
  const startRef = useRef(performance.now())
  const finishedRef = useRef(false)

  const round = scenario.rounds[phase.round]

  const finishRound = (): void => {
    if (phase.round + 1 < scenario.rounds.length) {
      setSelected(new Set())
      setRevealed(false)
      setPhase({ kind: 'study', round: phase.round + 1, index: 0 })
    } else if (!finishedRef.current) {
      finishedRef.current = true
      onFinish(score(scenario, answersRef.current))
    }
  }

  /** Record the whole grid (selected or not) and move on. */
  const confirmGrid = (): void => {
    if (revealed) return
    const rtMs = performance.now() - startRef.current
    round.grid.forEach((_, index) =>
      answersRef.current.push({
        type: 'grid',
        round: phase.round,
        index,
        selected: selected.has(index),
        rtMs
      })
    )
    if (feedback) {
      setRevealed(true)
      setTimeout(finishRound, 1600)
    } else {
      finishRound()
    }
  }

  const answerCalc = (answerIndex: number | null): void => {
    if (phase.kind !== 'calc') return
    answersRef.current.push({
      type: 'calc',
      round: phase.round,
      index: phase.index,
      answerIndex,
      rtMs: performance.now() - startRef.current
    })
    if (phase.index + 1 < round.calcs.length) {
      startRef.current = performance.now()
      setPhase({ kind: 'calc', round: phase.round, index: phase.index + 1 })
    } else {
      startRef.current = performance.now()
      setPhase({ kind: 'grid', round: phase.round })
    }
  }

  // ---- study: each shape for studyMs, then the calculations ----
  const studyMs = round.studyMs * timingMultiplier
  const studyRemaining = useCountdown(
    phase.kind === 'study' ? `${phase.round}-${phase.index}` : null,
    phase.kind === 'study' ? studyMs : null,
    () => {
      if (phase.kind !== 'study') return
      if (phase.index + 1 < round.study.length) {
        setPhase({ kind: 'study', round: phase.round, index: phase.index + 1 })
      } else {
        startRef.current = performance.now()
        setPhase({ kind: 'calc', round: phase.round, index: 0 })
      }
    }
  )

  const calcMs = round.calcTimeLimitMs * timingMultiplier
  const calcRemaining = useCountdown(
    phase.kind === 'calc' ? `${phase.round}-${phase.index}` : null,
    phase.kind === 'calc' ? calcMs : null,
    () => answerCalc(null)
  )

  const gridMs = round.gridTimeLimitMs * timingMultiplier
  const gridRemaining = useCountdown(
    phase.kind === 'grid' && !revealed ? phase.round : null,
    phase.kind === 'grid' && !revealed ? gridMs : null,
    confirmGrid
  )

  const header = `Round ${phase.round + 1} / ${scenario.rounds.length}`

  if (phase.kind === 'study') {
    return (
      <div className="session">
        <div className="progress">
          {header} — remember this shape ({phase.index + 1} / {round.study.length})
        </div>
        <CountdownBar remainingMs={studyRemaining} totalMs={studyMs} />
        <div className="stimulus-box" style={{ minHeight: 240 }}>
          <ShapeArt shape={round.study[phase.index]} size={160} />
        </div>
      </div>
    )
  }

  if (phase.kind === 'calc') {
    const calc = round.calcs[phase.index]
    return (
      <div className="session">
        <div className="progress">
          {header} — calculation {phase.index + 1} / {round.calcs.length}
        </div>
        <CountdownBar remainingMs={calcRemaining} totalMs={calcMs} />
        <div className="stimulus-box" style={{ minHeight: 180 }}>
          <span style={{ fontSize: '2.2rem', fontWeight: 700 }}>{calc.text} = ?</span>
        </div>
        <OptionButtons
          options={calc.options.map((o) => (
            <span key={o}>{o}</span>
          ))}
          onSelect={answerCalc}
        />
      </div>
    )
  }

  // ---- recall grid ----
  return (
    <div className="session" style={{ maxWidth: 900 }}>
      <div className="progress">
        {header} — click every shape you saw, then confirm
      </div>
      <CountdownBar remainingMs={revealed ? 0 : gridRemaining} totalMs={gridMs} />
      <div className="stimulus-box">
        <div className="recall-grid">
          {round.grid.map((cell, i) => {
            const isOn = selected.has(i)
            const mark = revealed ? (cell.target ? ' target' : isOn ? ' wrong' : '') : ''
            return (
              <button
                key={i}
                type="button"
                className={`recall-cell${isOn ? ' selected' : ''}${mark}`}
                aria-pressed={isOn}
                disabled={revealed}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }
              >
                <ShapeArt shape={cell.shape} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" disabled={revealed} onClick={confirmGrid}>
          Confirm {selected.size} selected
        </button>
      </div>
      {revealed && <p className="reveal-note">Outlined in green = shapes you should have picked.</p>}
    </div>
  )
}
