import { useEffect, useMemo, useState } from 'react'
import type { OverviewStats, SessionRecord } from '@shared/results'
import { formatDuration } from '@shared/stats'
import type { TaskId } from '@shared/types'
import { TrendChart } from '@renderer/components/TrendChart'
import { TASKS_BY_ID } from '@renderer/engine/tasks/registry'

function fmtDate(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function StatsPage(): React.JSX.Element {
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [recent, setRecent] = useState<SessionRecord[]>([])
  const [taskId, setTaskId] = useState<TaskId | null>(null)
  const [taskSessions, setTaskSessions] = useState<SessionRecord[]>([])
  const bridge = window.vectormind

  useEffect(() => {
    void bridge?.getOverview().then(setOverview)
    void bridge?.listSessions({ limit: 300 }).then((sessions) => {
      setRecent(sessions)
      // preselect the most recently practiced task
      if (sessions.length > 0) setTaskId((cur) => cur ?? sessions[0].taskId)
    })
  }, [bridge])

  useEffect(() => {
    if (!taskId) return
    void bridge?.listSessions({ taskId, limit: 100 }).then(setTaskSessions)
  }, [bridge, taskId])

  const taskCounts = useMemo(() => {
    const counts = new Map<TaskId, number>()
    for (const s of recent) counts.set(s.taskId, (counts.get(s.taskId) ?? 0) + 1)
    return counts
  }, [recent])

  const chronological = useMemo(() => taskSessions.slice().reverse(), [taskSessions])

  const accuracyPoints = chronological.map((s) => ({
    label: fmtDate(s.startedAt),
    value: s.accuracy * 100
  }))
  const rtPoints = chronological
    .filter((s) => s.meanRtMs !== null)
    .map((s) => ({ label: fmtDate(s.startedAt), value: (s.meanRtMs ?? 0) / 1000 }))

  if (!bridge) {
    return (
      <div>
        <h1>Statistics</h1>
        <p className="subtitle">Statistics are available in the desktop app.</p>
      </div>
    )
  }

  if (overview && overview.totalSessions === 0) {
    return (
      <div>
        <h1>Statistics</h1>
        <p className="subtitle">
          No sessions recorded yet. Complete any training run and your history, trends and
          personal percentiles will appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Statistics</h1>
      {overview && (
        <div className="results-stats" style={{ justifyContent: 'flex-start', margin: '18px 0' }}>
          <div className="stat-tile">
            <div className="value">{overview.totalSessions}</div>
            <div className="label">Sessions</div>
          </div>
          <div className="stat-tile">
            <div className="value">{formatDuration(overview.totalDurationMs)}</div>
            <div className="label">Practice time</div>
          </div>
          <div className="stat-tile">
            <div className="value">{overview.tasksPracticed}</div>
            <div className="label">Tasks practiced</div>
          </div>
          <div className="stat-tile">
            <div className="value">
              {overview.recentMeanAccuracy === null
                ? '—'
                : `${Math.round(overview.recentMeanAccuracy * 100)}%`}
            </div>
            <div className="label">Recent accuracy (last 20)</div>
          </div>
        </div>
      )}

      <h2>By task</h2>
      <div className="task-picker">
        {[...taskCounts.entries()].map(([id, count]) => (
          <button
            key={id}
            type="button"
            className={`btn${taskId === id ? ' primary' : ''}`}
            onClick={() => setTaskId(id)}
          >
            {TASKS_BY_ID.get(id)?.name ?? id} <span className="count">({count})</span>
          </button>
        ))}
      </div>

      {taskId && (
        <>
          <div className="charts-row">
            <TrendChart
              title="Accuracy per session"
              points={accuracyPoints}
              yFormat={(v) => `${Math.round(v)}%`}
              color="var(--accent)"
              yDomain={[0, 100]}
            />
            <TrendChart
              title="Mean response time per session"
              points={rtPoints}
              yFormat={(v) => `${v.toFixed(1)}s`}
              color="var(--warn)"
            />
          </div>

          <h2>Session history</h2>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Difficulty</th>
                <th>Accuracy</th>
                <th>Correct</th>
                <th>Mean RT</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {taskSessions.slice(0, 15).map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.startedAt)}</td>
                  <td>{s.difficulty}</td>
                  <td>{Math.round(s.accuracy * 100)}%</td>
                  <td>
                    {s.correct}/{s.totalItems}
                  </td>
                  <td>{s.meanRtMs === null ? '—' : `${(s.meanRtMs / 1000).toFixed(1)}s`}</td>
                  <td>{formatDuration(s.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
