import { CountdownBar } from '@renderer/components/CountdownBar'
import { OptionButtons } from '@renderer/components/OptionButtons'
import { SymbolSvg } from '@renderer/components/SymbolSvg'
import { useItemRunner } from '@renderer/engine/core/useItemRunner'
import type { TaskViewProps } from '../taskView'
import { score, type CubeFoldingItem, type CubeFoldingScenario, type CubeView } from './generator'

const CELL = 44

function NetSvg({ item }: { item: CubeFoldingItem }): React.JSX.Element {
  const maxX = Math.max(...item.netCells.map(([x]) => x)) + 1
  const maxY = Math.max(...item.netCells.map(([, y]) => y)) + 1
  return (
    <svg width={maxX * CELL} height={maxY * CELL} viewBox={`0 0 ${maxX * CELL} ${maxY * CELL}`}>
      {item.netCells.map(([x, y], i) => (
        <g key={i} transform={`translate(${x * CELL}, ${y * CELL})`}>
          <rect
            x={1}
            y={1}
            width={CELL - 2}
            height={CELL - 2}
            fill="var(--bg-raised)"
            stroke="var(--text-dim)"
            rx={3}
          />
          <g transform={`translate(${CELL / 2 - 13}, ${CELL / 2 - 13})`}>
            <SymbolSvg id={item.netSymbols[i]} size={26} />
          </g>
        </g>
      ))}
    </svg>
  )
}

/** Pseudo-3D cube: front square plus skewed top and right faces. */
function CubeSvg({ view }: { view: CubeView }): React.JSX.Element {
  const F = 44 // front face edge
  const kx = 18
  const ky = 13 // skew offsets for the "depth" edges
  return (
    <svg width={F + kx + 6} height={F + ky + 6} viewBox={`0 0 ${F + kx + 6} ${F + ky + 6}`}>
      <g transform={`translate(3, ${ky + 3})`}>
        <polygon
          points={`0,0 ${F},0 ${F + kx},${-ky} ${kx},${-ky}`}
          fill="var(--bg-raised)"
          stroke="var(--text-dim)"
        />
        <polygon
          points={`${F},0 ${F + kx},${-ky} ${F + kx},${F - ky} ${F},${F}`}
          fill="var(--bg)"
          stroke="var(--text-dim)"
        />
        <polygon points={`0,0 ${F},0 ${F},${F} 0,${F}`} fill="var(--bg-panel)" stroke="var(--text-dim)" />
        <g transform={`translate(${F / 2 - 12}, ${F / 2 - 12})`}>
          <SymbolSvg id={view.front} size={24} />
        </g>
        <g transform={`translate(${F / 2 + kx / 2 - 8}, ${-ky / 2 - 8})`}>
          <SymbolSvg id={view.top} size={16} />
        </g>
        <g transform={`translate(${F + kx / 2 - 8}, ${F / 2 - ky / 2 - 8})`}>
          <SymbolSvg id={view.right} size={16} />
        </g>
      </g>
    </svg>
  )
}

export function CubeFoldingView({
  scenario,
  timingMultiplier,
  feedback,
  onFinish
}: TaskViewProps<CubeFoldingScenario>): React.JSX.Element | null {
  const runner = useItemRunner({
    items: scenario.items,
    timeLimitOf: (i) => i.timeLimitMs * timingMultiplier,
    feedbackMs: feedback ? 1600 : 0,
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
    <div className="session">
      <div className="progress">
        Item {runner.index + 1} / {runner.total}
      </div>
      <CountdownBar remainingMs={runner.remainingMs} totalMs={runner.totalMs} />
      <div className="stimulus-box">
        <NetSvg item={item} />
        <p className="question-text" style={{ margin: 0 }}>
          Which cube can be folded from this net?
        </p>
      </div>
      <OptionButtons
        options={item.options.map((v, i) => (
          <CubeSvg key={i} view={v} />
        ))}
        onSelect={runner.answer}
        disabled={!!reveal}
        markClass={markClass}
      />
      {reveal && (
        <p className="reveal-note">
          {reveal.answerIndex === item.correctIndex
            ? '✓ Correct — that cube folds from the net.'
            : `✗ Cube ${item.correctIndex + 1} is the one that folds. The others show a mirror image or an opposite face.`}
        </p>
      )}
    </div>
  )
}
