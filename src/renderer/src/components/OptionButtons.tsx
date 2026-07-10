import { useEffect } from 'react'

interface Props {
  options: React.ReactNode[]
  onSelect: (index: number) => void
  /** Optional keyboard keys per option (defaults to 1..9). */
  keys?: string[]
  /** Shown as small hints under each option. */
  keyLabels?: string[]
}

/** Multiple-choice option row with number-key (or custom-key) shortcuts. */
export function OptionButtons({ options, onSelect, keys, keyLabels }: Props): React.JSX.Element {
  const effectiveKeys = keys ?? options.map((_, i) => String(i + 1))

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const idx = effectiveKeys.indexOf(e.key)
      if (idx >= 0 && idx < options.length) {
        e.preventDefault()
        onSelect(idx)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [effectiveKeys, onSelect, options.length])

  return (
    <div className="mc-options">
      {options.map((content, i) => (
        <button key={i} type="button" className="mc-option" onClick={() => onSelect(i)}>
          {content}
          <span className="keyhint">{keyLabels?.[i] ?? effectiveKeys[i]}</span>
        </button>
      ))}
    </div>
  )
}
