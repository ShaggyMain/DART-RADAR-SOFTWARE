import type { SaveOutcome } from '@shared/results'
import type { TaskResult } from '@shared/types'

export type SaveInfo =
  | { state: 'unavailable' }
  | { state: 'saving' }
  | { state: 'saved'; outcome: SaveOutcome }
  | { state: 'failed' }

interface Props {
  result: TaskResult
  /** Human labels for extra metrics, e.g. { mathAccuracy: 'Math accuracy' }. */
  extraLabels?: Record<string, string>
  saveInfo?: SaveInfo
  onRetry: () => void
  onExit: () => void
}

function formatExtra(key: string, value: number): string {
  if (key.toLowerCase().includes('accuracy')) return `${Math.round(value * 100)}%`
  return String(Math.round(value * 100) / 100)
}

function saveLine(saveInfo: SaveInfo | undefined): string | null {
  if (!saveInfo) return null
  switch (saveInfo.state) {
    case 'saving':
      return 'Saving session…'
    case 'failed':
      return 'Could not save this session.'
    case 'saved': {
      const { attempts, percentile } = saveInfo.outcome
      if (percentile === null) {
        return `Run #${attempts} at this task & difficulty — baseline recorded.`
      }
      return `Run #${attempts} at this task & difficulty · better than ${Math.round(percentile)}% of your previous runs.`
    }
    default:
      return null
  }
}

export function ResultsSummary({
  result,
  extraLabels,
  saveInfo,
  onRetry,
  onExit
}: Props): React.JSX.Element {
  const line = saveLine(saveInfo)
  return (
    <div className="session">
      <h1>Results</h1>
      <div className="results-stats">
        <div className="stat-tile">
          <div className="value">{Math.round(result.accuracy * 100)}%</div>
          <div className="label">Accuracy</div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {result.correct}/{result.totalItems}
          </div>
          <div className="label">Correct</div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {result.meanRtMs === null ? '—' : `${(result.meanRtMs / 1000).toFixed(1)}s`}
          </div>
          <div className="label">Mean response time</div>
        </div>
        {result.extra &&
          Object.entries(result.extra).map(([key, value]) => (
            <div className="stat-tile" key={key}>
              <div className="value">{formatExtra(key, value)}</div>
              <div className="label">{extraLabels?.[key] ?? key}</div>
            </div>
          ))}
      </div>
      <div className="item-dots">
        {result.items.map((item) => (
          <span
            key={item.index}
            className={`item-dot ${item.timedOut ? 'timeout' : item.correct ? 'ok' : 'miss'}`}
            title={`Item ${item.index + 1}: ${item.timedOut ? 'timed out' : item.correct ? 'correct' : 'wrong'}`}
          />
        ))}
      </div>
      {line && <p className="save-line">{line}</p>}
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={onRetry}>
          Try again (new scenario)
        </button>
        <button type="button" className="btn" onClick={onExit}>
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
