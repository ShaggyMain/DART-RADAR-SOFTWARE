import type { SymbolId } from '@renderer/engine/tasks/cube-folding/generator'

interface Props {
  id: SymbolId
  size?: number
  color?: string
}

/** Original 90°-rotation-invariant symbols used on cube faces. */
export function SymbolSvg({ id, size = 24, color = 'var(--text)' }: Props): React.JSX.Element {
  const s = size
  const c = s / 2
  const common = { fill: color }
  const stroke = { fill: 'none', stroke: color, strokeWidth: s * 0.12 }
  let content: React.JSX.Element
  switch (id) {
    case 'circle':
      content = <circle cx={c} cy={c} r={s * 0.38} {...common} />
      break
    case 'ring':
      content = <circle cx={c} cy={c} r={s * 0.32} {...stroke} />
      break
    case 'square':
      content = <rect x={s * 0.16} y={s * 0.16} width={s * 0.68} height={s * 0.68} {...common} />
      break
    case 'frame':
      content = <rect x={s * 0.18} y={s * 0.18} width={s * 0.64} height={s * 0.64} {...stroke} />
      break
    case 'diamond':
      content = (
        <polygon
          points={`${c},${s * 0.08} ${s * 0.92},${c} ${c},${s * 0.92} ${s * 0.08},${c}`}
          {...common}
        />
      )
      break
    case 'cross':
      content = (
        <path
          d={`M ${c - s * 0.12} ${s * 0.1} h ${s * 0.24} v ${c - s * 0.22} h ${c - s * 0.22} v ${s * 0.24} h -${c - s * 0.22} v ${c - s * 0.22} h -${s * 0.24} v -${c - s * 0.22} h -${c - s * 0.22} v -${s * 0.24} h ${c - s * 0.22} Z`}
          {...common}
        />
      )
      break
    case 'x':
      content = (
        <g stroke={color} strokeWidth={s * 0.14} strokeLinecap="round">
          <line x1={s * 0.18} y1={s * 0.18} x2={s * 0.82} y2={s * 0.82} />
          <line x1={s * 0.82} y1={s * 0.18} x2={s * 0.18} y2={s * 0.82} />
        </g>
      )
      break
    case 'dot4':
      content = (
        <g {...common}>
          <circle cx={s * 0.3} cy={s * 0.3} r={s * 0.12} />
          <circle cx={s * 0.7} cy={s * 0.3} r={s * 0.12} />
          <circle cx={s * 0.3} cy={s * 0.7} r={s * 0.12} />
          <circle cx={s * 0.7} cy={s * 0.7} r={s * 0.12} />
        </g>
      )
      break
    case 'target':
      content = (
        <g>
          <circle cx={c} cy={c} r={s * 0.36} {...stroke} />
          <circle cx={c} cy={c} r={s * 0.13} {...common} />
        </g>
      )
      break
  }
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      {content}
    </svg>
  )
}
