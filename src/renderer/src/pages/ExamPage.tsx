import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskResult } from '@shared/types'
import { TASKS_BY_ID } from '@renderer/engine/tasks/registry'
import type { TaskViewProps } from '@renderer/engine/tasks/taskView'
import { useSettings } from '@renderer/state/settings'
import {
  BLUEPRINTS,
  BREAK_MIN_S,
  BREAK_TOTAL_S,
  EXAM_DIFFICULTY,
  moduleStanine,
  overallStanine,
  type ExamBlueprint,
  type ModuleOutcome
} from '@renderer/services/exam'

type ExamState =
  | { kind: 'choose' }
  | { kind: 'module-intro'; block: number; module: number }
  | { kind: 'running'; block: number; module: number; seed: string }
  | { kind: 'break'; nextBlock: number }
  | { kind: 'summary' }

function StanineBar({ value }: { value: number }): React.JSX.Element {
  return (
    <div className="stanine-bar" title={`stanine ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`stanine-cell${i + 1 === value ? ' active' : ''}`}>
          {i + 1 === value ? value : ''}
        </span>
      ))}
    </div>
  )
}

export function ExamPage(): React.JSX.Element {
  const navigate = useNavigate()
  const timingPreset = useSettings((s) => s.settings.timingPreset)
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null)
  const [state, setState] = useState<ExamState>({ kind: 'choose' })
  const [breakLeft, setBreakLeft] = useState(BREAK_TOTAL_S)
  const outcomesRef = useRef<ModuleOutcome[]>([])
  const examIdRef = useRef('')
  const moduleStartRef = useRef(0)

  const totalModules = useMemo(
    () => (blueprint ? blueprint.blocks.reduce((n, b) => n + b.modules.length, 0) : 0),
    [blueprint]
  )
  const moduleNumber = (block: number, module: number): number => {
    if (!blueprint) return 0
    let n = 0
    for (let b = 0; b < block; b++) n += blueprint.blocks[b].modules.length
    return n + module + 1
  }

  useEffect(() => {
    if (state.kind !== 'break') return
    setBreakLeft(BREAK_TOTAL_S)
    const started = performance.now()
    const interval = setInterval(() => {
      const left = BREAK_TOTAL_S - Math.floor((performance.now() - started) / 1000)
      setBreakLeft(left)
      if (left <= 0) {
        clearInterval(interval)
        setState({ kind: 'module-intro', block: state.nextBlock, module: 0 })
      }
    }, 250)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind])

  const startExam = (bp: ExamBlueprint): void => {
    outcomesRef.current = []
    examIdRef.current = Date.now().toString(36)
    setBlueprint(bp)
    setState({ kind: 'module-intro', block: 0, module: 0 })
  }

  const advance = (block: number, module: number): void => {
    if (!blueprint) return
    if (module + 1 < blueprint.blocks[block].modules.length) {
      setState({ kind: 'module-intro', block, module: module + 1 })
    } else if (block + 1 < blueprint.blocks.length) {
      setState({ kind: 'break', nextBlock: block + 1 })
    } else {
      setState({ kind: 'summary' })
    }
  }

  const finishModule = (block: number, module: number, result: TaskResult): void => {
    if (!blueprint) return
    const taskId = blueprint.blocks[block].modules[module]
    const outcome: ModuleOutcome = { taskId, result, save: null }
    outcomesRef.current.push(outcome)
    const bridge = window.vectormind
    if (bridge) {
      bridge
        .saveSession({
          taskId,
          seed: `exam-${examIdRef.current}-${taskId}`,
          difficulty: EXAM_DIFFICULTY,
          startedAt: moduleStartRef.current,
          durationMs: Date.now() - moduleStartRef.current,
          timingPreset,
          result
        })
        .then((save) => {
          outcome.save = save
        })
        .catch(() => undefined)
    }
    advance(block, module)
  }

  if (state.kind === 'choose') {
    return (
      <div className="session" style={{ maxWidth: 760 }}>
        <h1>Exam simulation</h1>
        <div className="stimulus-box" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Modules run back-to-back in a fixed order at difficulty {EXAM_DIFFICULTY}, with short
            mandatory breaks between blocks. You get NO feedback until the end — then a normalised,
            stanine-style summary (1–9) of every module.
          </p>
          <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            The summary compares you against your own practice history (or a built-in practice
            reference when history is thin). It is training feedback only — it does not predict
            official FEAST results, whose scoring and norms are not public.
          </p>
        </div>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          {BLUEPRINTS.map((bp) => (
            <button key={bp.id} type="button" className="task-card" style={{ maxWidth: 300 }} onClick={() => startExam(bp)}>
              <div className="name">
                {bp.name} · ~{bp.approxMinutes} min
              </div>
              <div className="desc">{bp.description}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!blueprint) return <div />

  if (state.kind === 'module-intro') {
    const taskId = blueprint.blocks[state.block].modules[state.module]
    const entry = TASKS_BY_ID.get(taskId)!
    return (
      <div className="session">
        <div className="progress">
          Module {moduleNumber(state.block, state.module)} / {totalModules} · block “
          {blueprint.blocks[state.block].name}”
        </div>
        <h1>{entry.name}</h1>
        <div className="stimulus-box" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
          {entry.instructions.map((p, i) => (
            <p key={i} style={{ margin: 0, lineHeight: 1.6 }}>
              {p}
            </p>
          ))}
        </div>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              moduleStartRef.current = Date.now()
              setState({
                kind: 'running',
                block: state.block,
                module: state.module,
                seed: `exam-${examIdRef.current}-${taskId}`
              })
            }}
          >
            Start module
          </button>
        </div>
      </div>
    )
  }

  if (state.kind === 'running') {
    const taskId = blueprint.blocks[state.block].modules[state.module]
    const entry = TASKS_BY_ID.get(taskId)!
    const scenario = entry.generate(state.seed, EXAM_DIFFICULTY)
    const View = entry.View as React.ComponentType<TaskViewProps<typeof scenario>>
    const { block, module } = state
    return (
      <View
        key={state.seed}
        scenario={scenario}
        timingMultiplier={1}
        onFinish={(result) => finishModule(block, module, result)}
      />
    )
  }

  if (state.kind === 'break') {
    return (
      <div className="session">
        <h1>Break</h1>
        <div className="stimulus-box" style={{ minHeight: 160 }}>
          <p className="question-text" style={{ margin: 0 }}>
            Next block: “{blueprint.blocks[state.nextBlock].name}”
          </p>
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            Continue in {breakLeft}s — stand up, look away from the screen.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={breakLeft > BREAK_TOTAL_S - BREAK_MIN_S}
            onClick={() => setState({ kind: 'module-intro', block: state.nextBlock, module: 0 })}
          >
            Continue now
          </button>
        </div>
      </div>
    )
  }

  // summary
  const stanines = outcomesRef.current.map(moduleStanine)
  const overall = overallStanine(stanines)
  return (
    <div className="session" style={{ maxWidth: 820 }}>
      <h1>Exam summary</h1>
      <div className="results-stats">
        <div className="stat-tile">
          <div className="value">{overall}</div>
          <div className="label">Overall stanine (practice)</div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {Math.round(
              (stanines.reduce((s, m) => s + m.accuracy, 0) / Math.max(1, stanines.length)) * 100
            )}
            %
          </div>
          <div className="label">Mean accuracy</div>
        </div>
      </div>
      <table className="history-table" style={{ margin: '0 auto' }}>
        <thead>
          <tr>
            <th>Module</th>
            <th>Accuracy</th>
            <th>Stanine (1–9)</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {stanines.map((m, i) => (
            <tr key={i}>
              <td>{TASKS_BY_ID.get(m.taskId)?.name ?? m.taskId}</td>
              <td>{Math.round(m.accuracy * 100)}%</td>
              <td>
                <StanineBar value={m.stanine} />
              </td>
              <td style={{ color: 'var(--text-dim)' }}>
                {m.personalReference ? 'your history' : 'practice default'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="disclaimer" style={{ maxWidth: 720, margin: '26px auto 0' }}>
        This stanine-style summary is practice feedback normalised against your own training data
        (or a built-in practice reference). Official FEAST scoring and cut-offs are not public;
        this result does not predict them.
      </p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={() => setState({ kind: 'choose' })}>
          New exam
        </button>
        <button type="button" className="btn" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
