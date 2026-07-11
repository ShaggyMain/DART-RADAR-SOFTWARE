import { useState } from 'react'
import type { TimingPreset } from '@shared/settings'
import type { Difficulty } from '@shared/types'
import { DIFFICULTIES } from '@shared/types'
import { useSettings } from '@renderer/state/settings'

const PRESETS: { value: TimingPreset; label: string; hint: string }[] = [
  { value: 'relaxed', label: 'Relaxed', hint: '+50% time' },
  { value: 'realistic', label: 'Realistic', hint: 'baseline' },
  { value: 'strict', label: 'Strict', hint: '−25% time' }
]

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const load = useSettings((s) => s.load)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const bridge = window.vectormind

  const doExport = async (): Promise<void> => {
    if (!bridge) return
    setTransferStatus('Exporting…')
    const result = await bridge.exportData()
    setTransferStatus(
      result.status === 'saved'
        ? `Exported ${result.sessions} sessions to ${result.path}`
        : null
    )
  }

  const doImport = async (): Promise<void> => {
    if (!bridge) return
    setTransferStatus('Importing…')
    const result = await bridge.importData()
    if (result.status === 'imported') {
      setTransferStatus(
        `Imported ${result.imported} sessions (${result.skipped} already present or skipped).`
      )
      await load() // settings may have come with the bundle
    } else if (result.status === 'invalid') {
      setTransferStatus('That file is not a valid VectorMind export.')
    } else {
      setTransferStatus(null)
    }
  }

  return (
    <div>
      <h1>Settings</h1>
      <div className="settings-row">
        <div className="info">
          <div className="label">Timing preset</div>
          <div className="hint">
            Scales every exposure and answer time limit. Timings are configurable estimates from
            public candidate reports — no official values exist.
          </div>
        </div>
        <div className="seg">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={settings.timingPreset === p.value ? 'active' : ''}
              title={p.hint}
              onClick={() => void update({ timingPreset: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="info">
          <div className="label">Default difficulty</div>
          <div className="hint">Pre-selected level when opening a task (changeable per run).</div>
        </div>
        <div className="seg">
          {DIFFICULTIES.map((d: Difficulty) => (
            <button
              key={d}
              type="button"
              className={settings.defaultDifficulty === d ? 'active' : ''}
              onClick={() => void update({ defaultDifficulty: d })}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="info">
          <div className="label">Audio</div>
          <div className="hint">
            Spoken stimuli (number recall, later audio sub-tasks). When off, audio tasks show text
            briefly instead.
          </div>
        </div>
        <div className="seg">
          <button
            type="button"
            className={settings.audioEnabled ? 'active' : ''}
            onClick={() => void update({ audioEnabled: true })}
          >
            On
          </button>
          <button
            type="button"
            className={!settings.audioEnabled ? 'active' : ''}
            onClick={() => void update({ audioEnabled: false })}
          >
            Off
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div className="info">
          <div className="label">Training data</div>
          <div className="hint">
            Export your sessions and settings as a JSON file, or import a previous export.
            Importing merges — existing sessions are never duplicated.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => void doExport()} disabled={!bridge}>
            Export…
          </button>
          <button type="button" className="btn" onClick={() => void doImport()} disabled={!bridge}>
            Import…
          </button>
        </div>
      </div>
      {transferStatus && (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{transferStatus}</p>
      )}
      <p className="disclaimer">
        VectorMind is an independent practice tool, not affiliated with EUROCONTROL (FEAST),
        PANSA/PAŻP, SkyTest, or any test vendor. Practice scores are for training feedback only.
      </p>
    </div>
  )
}
