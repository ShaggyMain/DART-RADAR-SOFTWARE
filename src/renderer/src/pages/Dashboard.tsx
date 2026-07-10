import { useNavigate } from 'react-router-dom'
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

export function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <div>
      <h1>Training</h1>
      <p className="subtitle">
        Original, procedurally generated exercises for the cognitive skills screened in ATC
        selection. Pick a task; every run is a fresh scenario.
      </p>
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
