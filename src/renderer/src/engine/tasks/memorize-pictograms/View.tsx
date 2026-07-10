import { useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { GlyphSvg } from '@renderer/components/GlyphSvg'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import type { TaskViewProps } from '../taskView'
import { score, type PictogramScenario } from './generator'

type Phase =
  | { kind: 'study' }
  | { kind: 'math'; q: number }
  | { kind: 'recognition'; round: number }

export function MemorizePictogramsView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<PictogramScenario>): React.JSX.Element | null {
  const [itemIndex, setItemIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'study' })
  const mathRef = useRef<ItemResponse[]>([])
  const recognitionRef = useRef<ItemResponse[]>([])
  const answerStartRef = useRef(0)
  const finishedRef = useRef(false)

  const item = itemIndex < scenario.items.length ? scenario.items[itemIndex] : null
  const exposureMs = item ? item.exposureMs * timingMultiplier : 0

  const phaseKey =
    phase.kind === 'study'
      ? `s${itemIndex}`
      : phase.kind === 'math'
        ? `m${itemIndex}-${phase.q}`
        : `r${itemIndex}-${phase.round}`

  const currentLimitMs = !item
    ? null
    : phase.kind === 'study'
      ? exposureMs
      : phase.kind === 'math'
        ? item.mathQuestions[phase.q].timeLimitMs * timingMultiplier
        : item.recognitionRounds[phase.round].timeLimitMs * timingMultiplier

  const goTo = (next: Phase): void => {
    answerStartRef.current = performance.now()
    setPhase(next)
  }

  const advance = (answerIndex: number | null): void => {
    if (!item || finishedRef.current) return
    const response: ItemResponse = {
      answerIndex,
      rtMs: performance.now() - answerStartRef.current
    }
    if (phase.kind === 'math') {
      mathRef.current.push(response)
      if (phase.q + 1 < item.mathQuestions.length) {
        goTo({ kind: 'math', q: phase.q + 1 })
      } else {
        goTo({ kind: 'recognition', round: 0 })
      }
    } else if (phase.kind === 'recognition') {
      recognitionRef.current.push(response)
      if (phase.round + 1 < item.recognitionRounds.length) {
        goTo({ kind: 'recognition', round: phase.round + 1 })
      } else if (itemIndex + 1 < scenario.items.length) {
        setItemIndex(itemIndex + 1)
        setPhase({ kind: 'study' })
      } else {
        finishedRef.current = true
        onFinish(score(scenario, { math: mathRef.current, recognition: recognitionRef.current }))
      }
    }
  }

  const remaining = useCountdown(item ? phaseKey : null, currentLimitMs, () => {
    if (phase.kind === 'study') {
      goTo(item!.mathQuestions.length > 0 ? { kind: 'math', q: 0 } : { kind: 'recognition', round: 0 })
    } else {
      advance(null)
    }
  })

  if (!item) return null

  return (
    <div className="session">
      <div className="progress">
        Set {itemIndex + 1} / {scenario.items.length} —{' '}
        {phase.kind === 'study'
          ? 'memorize the pictograms!'
          : phase.kind === 'math'
            ? 'solve (interference)'
            : 'which one did you study?'}
      </div>
      <CountdownBar remainingMs={remaining} totalMs={currentLimitMs ?? 0} />
      {phase.kind === 'study' && (
        <div className="stimulus-box">
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {item.studySet.map((g, i) => (
              <GlyphSvg key={i} glyph={g} cell={18} color="var(--accent)" />
            ))}
          </div>
        </div>
      )}
      {phase.kind === 'math' && (
        <>
          <div className="stimulus-box" style={{ minHeight: 140 }}>
            <p className="question-text" style={{ margin: 0, fontSize: '1.6rem' }}>
              {item.mathQuestions[phase.q].prompt}
            </p>
          </div>
          <OptionButtons
            options={item.mathQuestions[phase.q].options.map((o) => (
              <span key={o}>{o}</span>
            ))}
            onSelect={advance}
          />
        </>
      )}
      {phase.kind === 'recognition' && (
        <>
          <div className="stimulus-box" style={{ minHeight: 100 }}>
            <p className="question-text" style={{ margin: 0 }}>
              Select the pictogram you studied.
            </p>
          </div>
          <OptionButtons
            options={item.recognitionRounds[phase.round].options.map((g, i) => (
              <GlyphSvg key={i} glyph={g} cell={14} />
            ))}
            onSelect={advance}
          />
        </>
      )}
    </div>
  )
}
