import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Difficulty, TaskId, TaskResult } from '@shared/types'
import { ResultsSummary } from '@renderer/components/ResultsSummary'
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
  const timingMultiplier = useTimingMultiplier()

  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty)
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [runCounter, setRunCounter] = useState(0)

  const entry = taskId ? TASKS_BY_ID.get(taskId) : undefined

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
    setPhase({ kind: 'run', seed: freshSeed(entry.id, next) })
  }

  if (phase.kind === 'intro') {
    return (
      <TaskIntro
        name={entry.name}
        instructions={entry.instructions}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        onStart={startRun}
      />
    )
  }

  if (phase.kind === 'run' && scenario) {
    const View = entry.View as React.ComponentType<TaskViewProps<typeof scenario>>
    return (
      <View
        key={phase.seed}
        scenario={scenario}
        timingMultiplier={timingMultiplier}
        onFinish={(result) => setPhase({ kind: 'done', result })}
      />
    )
  }

  if (phase.kind === 'done') {
    return (
      <ResultsSummary
        result={phase.result}
        extraLabels={entry.extraLabels}
        onRetry={startRun}
        onExit={() => navigate('/')}
      />
    )
  }

  return <div />
}
