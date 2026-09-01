import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import {
  messageText,
  score,
  type CategorySortScenario,
  type SortCategory,
  type SortColour,
  type SortObject,
  type SortShape
} from './generator'

/** Category colours are fixed so the swatches always read as themselves. */
const COLOUR_HEX: Record<SortColour, string> = {
  red: '#e5604c',
  blue: '#4a90e2',
  green: '#45d17e',
  yellow: '#e0b34d'
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner
    const a = ((-90 + i * 36) * Math.PI) / 180
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
  }).join(' ')
}

/** One shape in a 100x100 box, either filled with a colour or drawn as an outline. */
function ShapeGlyph({
  shape,
  fill,
  size
}: {
  shape: SortShape
  fill: string | null
  size: number
}): React.JSX.Element {
  const paint = fill
    ? { fill }
    : { fill: 'none', stroke: 'var(--text)', strokeWidth: 5, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shape === 'triangle' && <polygon points="50,10 90,88 10,88" {...paint} />}
      {shape === 'square' && <rect x={12} y={12} width={76} height={76} rx={4} {...paint} />}
      {shape === 'circle' && <circle cx={50} cy={50} r={39} {...paint} />}
      {shape === 'star' && <polygon points={starPoints(50, 52, 42, 18)} {...paint} />}
    </svg>
  )
}

function ObjectArt({ object, size }: { object: SortObject; size: number }): React.JSX.Element {
  if (object.kind === 'number') {
    return (
      <span style={{ fontSize: size * 0.42, fontWeight: 700, lineHeight: `${size}px` }}>
        {object.value}
      </span>
    )
  }
  return (
    <ShapeGlyph
      shape={object.shape}
      fill={object.kind === 'colour' ? COLOUR_HEX[object.colour] : null}
      size={size}
    />
  )
}

function CategoryArt({ category }: { category: SortCategory }): React.JSX.Element {
  switch (category.type) {
    case 'pair':
      return <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>Pair</span>
    case 'colour':
      return (
        <svg width={54} height={40} viewBox="0 0 54 40" aria-label={category.colour}>
          <rect x={2} y={4} width={50} height={32} rx={9} fill={COLOUR_HEX[category.colour]} />
        </svg>
      )
    case 'shape':
      return <ShapeGlyph shape={category.shape} fill={null} size={44} />
    case 'range':
      return (
        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          {category.min} – {category.max}
        </span>
      )
  }
}

function describeCategory(category: SortCategory): string {
  switch (category.type) {
    case 'pair':
      return 'Pair'
    case 'colour':
      return category.colour
    case 'shape':
      return category.shape
    case 'range':
      return `${category.min} to ${category.max}`
  }
}

export function CategorySortView({
  scenario,
  timingMultiplier,
  feedback,
  onFinish
}: TaskViewProps<CategorySortScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    feedbackMs: feedback ? 1100 : 0,
    onFinish: (responses) => onFinish(score(scenario, responses))
  })
  const item = runner.current
  if (!item) return null

  const reveal = runner.reveal
  const markClass = reveal
    ? (i: number): string | undefined =>
        i === item.correctIndex ? 'correct' : i === reveal.answerIndex ? 'wrong' : undefined
    : undefined

  return (
    <div className="session" style={{ maxWidth: 820 }}>
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />

      <div className="sort-message" aria-live="polite">
        {item.message ? `Message: ${messageText(item.message)}` : ' '}
      </div>

      <div className="stimulus-box">
        <div className="sort-boxes">
          <div className="sort-box">
            <div className="sort-box-title">Item</div>
            <div className="sort-box-art">
              <ObjectArt object={item.object} size={112} />
            </div>
          </div>
          <div className="sort-box">
            <div className="sort-box-title">Pair item</div>
            <div className="sort-box-art">
              {item.pairObject ? <ObjectArt object={item.pairObject} size={112} /> : null}
            </div>
          </div>
        </div>
      </div>

      <OptionButtons
        options={item.categories.map((c, i) => (
          <span key={i} aria-label={describeCategory(c)} style={{ display: 'block' }}>
            <CategoryArt category={c} />
          </span>
        ))}
        onSelect={runner.answer}
        disabled={!!reveal}
        markClass={markClass}
      />
      {reveal && (
        <p className="reveal-note">
          {reveal.answerIndex === item.correctIndex
            ? '✓ Correct'
            : `✗ It belonged in “${describeCategory(item.categories[item.correctIndex])}”`}
        </p>
      )}
    </div>
  )
}
