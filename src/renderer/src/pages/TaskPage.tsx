import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { recommendDifficulty } from '@shared/adaptive'
import type { SaveOutcome } from '@shared/results'
import type { Difficulty, TaskId, TaskResult } from '@shared/types'
import { ResultsSummary, type SaveInfo } from '@renderer/components/ResultsSummary'
import { TaskIntro } from '@renderer/components/TaskIntro'
import { TASKS_BY_ID } from '@renderer/engine/tasks/registry'
import type { TaskViewProps } from '@renderer/engine/tasks/taskView'
import { useSettings, useTimingMultiplier } from '@renderer/state/settings'

type Phase = { kind: 'intro' } | { kind: 'run'; seed: string } | { kind: 'done'; result: TaskResult }

/** Seed for a new session — uniqueness matters here, not reproducibility. */
function freshSeed(taskId: string, counter: number): string {
  return `${taskId}-${Date.now().toString(36)}-${counter}`
}

export function TaskPage(): React.JSX.Element {
  const { taskId } = useParams<{ taskId: TaskId }>()
  const navigate = useNavigate()
  const defaultDifficulty = useSettings((s) => s.settings.defaultDifficulty)
  const timingPreset = useSettings((s) => s.settings.timingPreset)
  const timingMultiplier = useTimingMultiplier()

  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty)
  const [recommended, setRecommended] = useState<Difficulty | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [runCounter, setRunCounter] = useState(0)
  const [saveInfo, setSaveInfo] = useState<SaveInfo>({ state: 'unavailable' })
  const startedAtRef = useRef(0)
  const userPickedRef = useRef(false)

  const entry = taskId ? TASKS_BY_ID.get(taskId) : undefined

  // Adaptive difficulty (M7): preselect the recommended level from recent
  // sessions at this task — unless the user has already picked one.
  useEffect(() => {
    if (!entry) return
    let cancelled = false
    void window.vectormind
      ?.listSessions({ taskId: entry.id, limit: 10 })
      .then((sessions) => {
        if (cancelled || sessions.length === 0) return
        const rec = recommendDifficulty(
          sessions.map((s) => ({ difficulty: s.difficulty, accuracy: s.accuracy })),
          defaultDifficulty
        )
        setRecommended(rec)
        if (!userPickedRef.current) setDifficulty(rec)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id])

  const scenario = useMemo(
    () => (entry && phase.kind === 'run' ? entry.generate(phase.seed, difficulty) : null),
    [entry, phase, difficulty]
  )

  if (!entry) {
    return (
      <div>
        <h1>Unknown task</h1>
        <button type="button" className="btn" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
      </div>
    )
  }

  const startRun = (): void => {
    const next = runCounter + 1
    setRunCounter(next)
    startedAtRef.current = Date.now()
    setSaveInfo({ state: 'unavailable' })
    setPhase({ kind: 'run', seed: freshSeed(entry.id, next) })
  }

  const finishRun = (seed: string, result: TaskResult): void => {
    setPhase({ kind: 'done', result })
    const bridge = window.vectormind
    if (!bridge) return
    setSaveInfo({ state: 'saving' })
    bridge
      .saveSession({
        taskId: entry.id,
        seed,
        difficulty,
        startedAt: startedAtRef.current,
        durationMs: Date.now() - startedAtRef.current,
        timingPreset,
        result
      })
      .then((outcome: SaveOutcome) => setSaveInfo({ state: 'saved', outcome }))
      .catch((err: unknown) => {
        console.error('Failed to save session', err)
        setSaveInfo({ state: 'failed' })
      })
  }

  if (phase.kind === 'intro') {
    return (
      <TaskIntro
        name={entry.name}
        instructions={entry.instructions}
        difficulty={difficulty}
        onDifficultyChange={(d) => {
          userPickedRef.current = true
          setDifficulty(d)
        }}
        onStart={startRun}
        recommendedDifficulty={recommended}
      />
    )
  }

  if (phase.kind === 'run' && scenario) {
    const View = entry.View as React.ComponentType<TaskViewProps<typeof scenario>>
    const seed = phase.seed
    return (
      <View
        key={seed}
        scenario={scenario}
        timingMultiplier={timingMultiplier}
        feedback
        onFinish={(result) => finishRun(seed, result)}
      />
    )
  }

  if (phase.kind === 'done') {
    return (
      <ResultsSummary
        result={phase.result}
        extraLabels={entry.extraLabels}
        saveInfo={saveInfo}
        onRetry={startRun}
        onExit={() => navigate('/')}
      />
    )
  }

  return <div />
}
