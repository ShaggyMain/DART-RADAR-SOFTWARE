import { useEffect } from 'react'

interface Props {
  options: React.ReactNode[]
  onSelect: (index: number) => void
  /** Optional keyboard keys per option (defaults to 1..9). */
  keys?: string[]
  /** Shown as small hints under each option. */
  keyLabels?: string[]
  /** Block all input (e.g. while a feedback reveal is showing). */
  disabled?: boolean
  /** Extra class per option, e.g. 'correct' | 'wrong' during a reveal. */
  markClass?: (index: number) => string | undefined
}

/** Multiple-choice option row with number-key (or custom-key) shortcuts. */
export function OptionButtons({
  options,
  onSelect,
  keys,
  keyLabels,
  disabled = false,
  markClass
}: Props): React.JSX.Element {
  const effectiveKeys = keys ?? options.map((_, i) => String(i + 1))

  useEffect(() => {
    if (disabled) return
    const handler = (e: KeyboardEvent): void => {
      const idx = effectiveKeys.indexOf(e.key)
      if (idx >= 0 && idx < options.length) {
        e.preventDefault()
        onSelect(idx)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [effectiveKeys, onSelect, options.length, disabled])

  return (
    <div className="mc-options">
      {options.map((content, i) => {
        const mark = markClass?.(i)
        return (
          <button
            key={i}
            type="button"
            className={`mc-option${mark ? ` ${mark}` : ''}`}
            disabled={disabled}
            onClick={() => onSelect(i)}
          >
            {content}
            <span className="keyhint">{keyLabels?.[i] ?? effectiveKeys[i]}</span>
          </button>
        )
      })}
    </div>
  )
}
