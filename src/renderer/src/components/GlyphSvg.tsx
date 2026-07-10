import type { Glyph } from '@shared/glyphs'

interface Props {
  glyph: Glyph
  /** Pixel size of one grid cell. */
  cell?: number
  color?: string
}

export function GlyphSvg({ glyph, cell = 16, color = 'var(--text)' }: Props): React.JSX.Element {
  const n = glyph.size
  const px = n * cell
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
      <rect
        x={0.5}
        y={0.5}
        width={px - 1}
        height={px - 1}
        fill="none"
        stroke="var(--border)"
      />
      {glyph.cells.map((filled, i) =>
        filled ? (
          <rect
            key={i}
            x={(i % n) * cell + 1}
            y={Math.floor(i / n) * cell + 1}
            width={cell - 2}
            height={cell - 2}
            fill={color}
            rx={2}
          />
        ) : null
      )}
    </svg>
  )
}
