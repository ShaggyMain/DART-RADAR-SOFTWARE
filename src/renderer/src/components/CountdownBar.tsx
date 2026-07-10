interface Props {
  remainingMs: number
  totalMs: number
}

export function CountdownBar({ remainingMs, totalMs }: Props): React.JSX.Element | null {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs))
  return (
    <div className="countdown-track">
      <div
        className={`countdown-fill${fraction < 0.25 ? ' low' : ''}`}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  )
}
