import { useEffect, useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'
import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useCountdown } from '@renderer/engine/core/useCountdown'
import { speak, speechAvailable } from '@renderer/engine/core/speech'
import { useSettings } from '@renderer/state/settings'
import type { TaskViewProps } from '../taskView'
import { score, type BigNumberScenario } from './generator'

/** How long the sentence stays visible when audio is unavailable. */
const TEXT_FALLBACK_MS = 3500

export function BigNumbersView({
  scenario,
  timingMultiplier,
  onFinish
}: TaskViewProps<BigNumberScenario>): React.JSX.Element | null {
  const audioEnabled = useSettings((s) => s.settings.audioEnabled)
  const useAudio = audioEnabled && speechAvailable()

  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'listen' | 'answer'>('listen')
  const responsesRef = useRef<ItemResponse[]>([])
  const answerStartRef = useRef(0)
  const finishedRef = useRef(false)

  const item = index < scenario.items.length ? scenario.items[index] : null
  const answerLimitMs = item ? item.timeLimitMs * timingMultiplier : 0

  // Play (or show) the stimulus, then open the answer window.
  useEffect(() => {
    if (!item || phase !== 'listen') return
    if (useAudio) {
      const cancel = speak(item.spokenText, () => {
        answerStartRef.current = performance.now()
        setPhase('answer')
      })
      return cancel
    }
    const timer = setTimeout(() => {
      answerStartRef.current = performance.now()
      setPhase('answer')
    }, TEXT_FALLBACK_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, useAudio])

  const record = (answerIndex: number | null): void => {
    if (!item || finishedRef.current) return
    responsesRef.current.push({
      answerIndex,
      rtMs: performance.now() - answerStartRef.current
    })
    if (index + 1 >= scenario.items.length) {
      finishedRef.current = true
      onFinish(score(scenario, responsesRef.current))
    } else {
      setIndex(index + 1)
      setPhase('listen')
    }
  }

  const remaining = useCountdown(
    phase === 'answer' ? index : null,
    phase === 'answer' ? answerLimitMs : null,
    () => record(null)
  )

  if (!item) return null

  return (
    <div className="session">
      <div className="progress">
        Item {index + 1} / {scenario.items.length}
      </div>
      {phase === 'answer' && <CountdownBar remainingMs={remaining} totalMs={answerLimitMs} />}
      <div className="stimulus-box" style={{ minHeight: 180 }}>
        {phase === 'listen' ? (
          useAudio ? (
            <p className="question-text" style={{ margin: 0, color: 'var(--text-dim)' }}>
              🔊 Listen carefully…
            </p>
          ) : (
            <p className="question-text" style={{ margin: 0 }}>
              {item.spokenText}
            </p>
          )
        ) : (
          <p className="question-text" style={{ margin: 0 }}>
            Which number {useAudio ? 'did you hear' : 'was in the sentence'}?
          </p>
        )}
      </div>
      {phase === 'answer' && (
        <OptionButtons
          options={item.options.map((o) => (
            <span key={o} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {o}
            </span>
          ))}
          onSelect={record}
        />
      )}
    </div>
  )
}
