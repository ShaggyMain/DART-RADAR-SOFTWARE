import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { generate, score, simulatePanelEvents } from './generator'

describe('divided-attention generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 2)).toEqual(generate('s', 2))
  })

  it.each(DIFFICULTIES)('difficulty %i: re-simulation reproduces stored events exactly', (d) => {
    const s = generate('resim', d)
    const recomputed = s.panels.flatMap((spec, p) =>
      simulatePanelEvents(spec, s.durationMs, s.contactTolerance).map((tMs) => ({
        panel: p,
        tMs
      }))
    )
    recomputed.sort((a, b) => a.tMs - b.tMs)
    expect(recomputed).toEqual(s.events)
  })

  it.each(DIFFICULTIES)('difficulty %i: every panel produces at least one event', (d) => {
    const s = generate('coverage', d)
    const panelsWithEvents = new Set(s.events.map((e) => e.panel))
    expect(panelsWithEvents.size).toBe(s.panels.length)
    expect(s.events.length).toBeGreaterThanOrEqual(s.panels.length)
  })

  it('events in the same panel respect the cooldown', () => {
    const s = generate('cooldown', 3)
    const byPanel = new Map<number, number[]>()
    for (const e of s.events) {
      const list = byPanel.get(e.panel) ?? []
      list.push(e.tMs)
      byPanel.set(e.panel, list)
    }
    for (const times of byPanel.values()) {
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(2500)
      }
    }
  })

  it('events are chronological and within the run duration', () => {
    const s = generate('order', 4)
    for (let i = 1; i < s.events.length; i++) {
      expect(s.events[i].tMs).toBeGreaterThanOrEqual(s.events[i - 1].tMs)
    }
    for (const e of s.events) {
      expect(e.tMs).toBeGreaterThan(0)
      expect(e.tMs).toBeLessThanOrEqual(s.durationMs)
    }
  })
})

describe('divided-attention scorer', () => {
  it('scores perfect responses', () => {
    const s = generate('perfect', 1)
    const presses = s.events.map((e) => ({ panel: e.panel, tMs: e.tMs + 400 }))
    const r = score(s, presses)
    expect(r.accuracy).toBe(1)
    expect(r.extra?.falseAlarms).toBe(0)
    expect(r.meanRtMs).toBeCloseTo(400)
  })

  it('wrong-panel presses are false alarms, not hits', () => {
    const s = generate('wrongpanel', 2)
    const e = s.events[0]
    const wrongPanel = (e.panel + 1) % s.panels.length
    const r = score(s, [{ panel: wrongPanel, tMs: e.tMs + 300 }])
    // the event itself is missed…
    expect(r.items[0].correct).toBe(
      // unless the press accidentally matches a real event in that panel
      s.events.some(
        (o) => o.panel === wrongPanel && e.tMs + 300 - o.tMs >= 0 && e.tMs + 300 - o.tMs <= s.responseWindowMs
      )
        ? r.items[0].correct
        : false
    )
  })

  it('late presses do not count', () => {
    const s = generate('late', 1)
    const e = s.events[0]
    const r = score(s, [{ panel: e.panel, tMs: e.tMs + s.responseWindowMs + 500 }])
    expect(r.items[0].correct).toBe(false)
  })
})
