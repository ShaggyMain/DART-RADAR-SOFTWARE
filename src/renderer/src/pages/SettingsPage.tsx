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
      <p className="disclaimer">
        VectorMind is an independent practice tool, not affiliated with EUROCONTROL (FEAST),
        PANSA/PAŻP, SkyTest, or any test vendor. Practice scores are for training feedback only.
      </p>
    </div>
  )
}
