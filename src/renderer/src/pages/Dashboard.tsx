import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SkillStateRecord } from '@shared/results'
import type { TaskCategory } from '@shared/types'
import { CATEGORY_LABELS, TASKS } from '@renderer/engine/tasks/registry'

const CATEGORY_ORDER: TaskCategory[] = [
  'attention',
  'memory',
  'spatial',
  'planning',
  'english',
  'simulation'
]

interface Recommendation {
  taskId: string
  name: string
  reason: string
}

function buildRecommendations(skills: SkillStateRecord[]): Recommendation[] {
  const byTask = new Map(skills.map((s) => [s.taskId, s]))
  const out: Recommendation[] = []
  for (const task of TASKS) {
    if (!byTask.has(task.id)) {
      out.push({ taskId: task.id, name: task.name, reason: 'not trained yet' })
    }
  }
  const trained = skills
    .filter((s) => TASKS.some((t) => t.id === s.taskId))
    .sort((a, b) => a.rating - b.rating)
  for (const s of trained) {
    const task = TASKS.find((t) => t.id === s.taskId)!
    out.push({
      taskId: s.taskId,
      name: task.name,
      reason: `${Math.round(s.rating * 100)}% recent accuracy`
    })
  }
  return out.slice(0, 3)
}

export function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const [skills, setSkills] = useState<SkillStateRecord[] | null>(null)

  useEffect(() => {
    void window.vectormind?.listSkillStates().then(setSkills)
  }, [])

  const recommendations = useMemo(() => (skills ? buildRecommendations(skills) : []), [skills])

  return (
    <div>
      <h1>Training</h1>
      <p className="subtitle">
        Original, procedurally generated exercises for the cognitive skills screened in ATC
        selection. Pick a task; every run is a fresh scenario.
      </p>
      {skills !== null && skills.length > 0 && recommendations.length > 0 && (
        <section>
          <h2>Recommended now</h2>
          <div className="task-grid">
            {recommendations.map((r) => (
              <button
                key={r.taskId}
                type="button"
                className="task-card recommended"
                onClick={() => navigate(`/task/${r.taskId}`)}
              >
                <div className="name">{r.name}</div>
                <div className="desc">{r.reason}</div>
              </button>
            ))}
          </div>
        </section>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const tasks = TASKS.filter((t) => t.category === cat)
        if (tasks.length === 0) return null
        return (
          <section key={cat}>
            <h2>{CATEGORY_LABELS[cat]}</h2>
            <div className="task-grid">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="task-card"
                  onClick={() => navigate(`/task/${t.id}`)}
                >
                  <div className="name">{t.name}</div>
                  <div className="desc">{t.shortDesc}</div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      <p className="disclaimer">
        VectorMind is an independent practice tool. It is not affiliated with, endorsed by, or
        connected to EUROCONTROL (FEAST), PANSA/PAŻP, SkyTest, or any test vendor. All exercises
        are original designs that train underlying abilities; they do not reproduce any real test
        items, and practice scores do not predict official results.
      </p>
    </div>
  )
}
