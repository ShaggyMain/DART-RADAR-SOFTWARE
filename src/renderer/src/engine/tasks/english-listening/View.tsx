import { useEffect, useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { speak, speechAvailable } from '@renderer/engine/core/speech'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import { score, type ListeningScenario } from './generator'

type Phase = { kind: 'listen' } | { kind: 'question'; q: number }

export function EnglishListeningView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<ListeningScenario>): React.JSX.Element | null {
  const audioEnabled = useSettings((s) => s.settings.audioEnabled)
  const useAudio = audioEnabled && speechAvailable()

  const [itemIndex, setItemIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'listen' })
  const [speaking, setSpeaking] = useState(false)
  const [replaysLeft, setReplaysLeft] = useState(scenario.items[0]?.replaysAllowed ?? 0)
  const responsesRef = useRef<ItemResponse[]>([])
  const answerStartRef = useRef(0)
  const finishedRef = useRef(false)
  const cancelSpeechRef = useRef<() => void>(() => undefined)

  const item = itemIndex < scenario.items.length ? scenario.items[itemIndex] : null
  const question = item && phase.kind === 'question' ? item.questions[phase.q] : null
  const questionLimitMs = question ? question.timeLimitMs * timingMultiplier : null

  const play = (): void => {
    if (!item) return
    setSpeaking(true)
    cancelSpeechRef.current = speak(
      item.text,
      () => {
        setSpeaking(false)
      },
      item.rate
    )
  }

  // Auto-play once per passage when audio is available.
  useEffect(() => {
    if (!item || phase.kind !== 'listen') return
    if (useAudio) play()
    return () => cancelSpeechRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIndex, useAudio])

  const startQuestions = (): void => {
    cancelSpeechRef.current()
    setSpeaking(false)
    answerStartRef.current = performance.now()
    setPhase({ kind: 'question', q: 0 })
  }

  const record = (answerIndex: number | null): void => {
    if (!item || phase.kind !== 'question' || finishedRef.current) return
    responsesRef.current.push({
      answerIndex,
      rtMs: performance.now() - answerStartRef.current
    })
    if (phase.q + 1 < item.questions.length) {
      answerStartRef.current = performance.now()
      setPhase({ kind: 'question', q: phase.q + 1 })
    } else if (itemIndex + 1 < scenario.items.length) {
      setReplaysLeft(scenario.items[itemIndex + 1].replaysAllowed)
      setItemIndex(itemIndex + 1)
      setPhase({ kind: 'listen' })
    } else {
      finishedRef.current = true
      onFinish(score(scenario, responsesRef.current))
    }
  }

  const remaining = useCountdown(
    question ? `${itemIndex}-${phase.kind === 'question' ? phase.q : ''}` : null,
    questionLimitMs,
    () => record(null)
  )

  if (!item) return null

  return (
    <div className="session">
      <div className="progress">
        Passage {itemIndex + 1} / {scenario.items.length}
        {phase.kind === 'question' && ` — question ${phase.q + 1} / ${item.questions.length}`}
      </div>
      {phase.kind === 'question' && questionLimitMs && (
        <CountdownBar remainingMs={remaining} totalMs={questionLimitMs} />
      )}
      {phase.kind === 'listen' ? (
        <div className="stimulus-box" style={{ minHeight: 220 }}>
          {useAudio ? (
            <>
              <p className="question-text" style={{ margin: 0, color: 'var(--text-dim)' }}>
                {speaking ? '🔊 Listen carefully…' : 'Playback finished.'}
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                {!speaking && replaysLeft > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setReplaysLeft(replaysLeft - 1)
                      play()
                    }}
                  >
                    Play again ({replaysLeft} left)
                  </button>
                )}
                {!speaking && (
                  <button type="button" className="btn primary" onClick={startQuestions}>
                    Answer questions
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, lineHeight: 1.7, maxWidth: 640, textAlign: 'left' }}>
                {item.text}
              </p>
              <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                Audio is off — read the passage, then answer from memory.
              </p>
              <button type="button" className="btn primary" onClick={startQuestions}>
                Answer questions
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="stimulus-box" style={{ minHeight: 140 }}>
            <p className="question-text" style={{ margin: 0 }}>
              {question!.prompt}
            </p>
          </div>
          <OptionButtons
            options={question!.options.map((o) => (
              <span key={o}>{o}</span>
            ))}
            onSelect={record}
          />
        </>
      )}
    </div>
  )
}
