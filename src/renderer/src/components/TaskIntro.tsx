import type { Difficulty } from '@shared/types'
import { DIFFICULTIES } from '@shared/types'

interface Props {
  name: string
  instructions: string[]
  difficulty: Difficulty
  onDifficultyChange: (d: Difficulty) => void
  onStart: () => void
}

export function TaskIntro({
  name,
  instructions,
  difficulty,
  onDifficultyChange,
  onStart
}: Props): React.JSX.Element {
  return (
    <div className="session">
      <h1>{name}</h1>
      <div className="stimulus-box" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        {instructions.map((p, i) => (
          <p key={i} style={{ margin: 0, lineHeight: 1.6 }}>
            {p}
          </p>
        ))}
      </div>
      <div className="btn-row" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-dim)' }}>Difficulty</span>
        <div className="seg">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={d === difficulty ? 'active' : ''}
              onClick={() => onDifficultyChange(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  )
}
