import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  computeEpisodes,
  departureMs,
  generate,
  score,
  stripStateAt,
  type StripScenario
} from './generator'

function tinyScenario(overrides: Partial<StripScenario> = {}): StripScenario {
  return {
    taskId: 'strip-management',
    seed: 't',
    difficulty: 1,
    points: [{ id: 'P1', name: 'P1' }],
    flights: [],
    updates: [],
    durationMs: 300_000,
    conflictEtaGapMin: 3,
    flagWindowMs: 25_000,
    plannedConflicts: 0,
    ...overrides
  }
}

describe('stripStateAt / departure', () => {
  it('counts ETA down and departs at zero', () => {
    const s = tinyScenario({
      flights: [{ callsign: 'AAA111', pointId: 'P1', appearMs: 10_000, etaMinAtAppear: 5, fl: 90 }]
    })
    const f = s.flights[0]
    expect(stripStateAt(s, f, 5_000).present).toBe(false)
    expect(stripStateAt(s, f, 70_000).etaMin).toBeCloseTo(4)
    expect(departureMs(f)).toBe(310_000)
  })

  it('applies FL updates at their scheduled time', () => {
    const s = tinyScenario({
      flights: [{ callsign: 'AAA111', pointId: 'P1', appearMs: 0, etaMinAtAppear: 10, fl: 90 }],
      updates: [{ tMs: 60_000, callsign: 'AAA111', newFl: 100 }]
    })
    expect(stripStateAt(s, s.flights[0], 30_000).fl).toBe(90)
    expect(stripStateAt(s, s.flights[0], 90_000).fl).toBe(100)
  })
})

describe('computeEpisodes', () => {
  it('detects an immediate same-level close-ETA pair from second appearance', () => {
    const s = tinyScenario({
      flights: [
        { callsign: 'AAA111', pointId: 'P1', appearMs: 0, etaMinAtAppear: 10, fl: 90 },
        { callsign: 'BBB222', pointId: 'P1', appearMs: 30_000, etaMinAtAppear: 8, fl: 90 }
      ]
    })
    // at t=30s: A eta 9.5, B eta 8 → gap 1.5 < 3 → conflict
    const eps = computeEpisodes(s)
    expect(eps).toHaveLength(1)
    expect(eps[0].startMs).toBe(30_000)
    // ends when B departs at 30s + 8min
    expect(eps[0].endMs).toBeCloseTo(510_000 > s.durationMs ? s.durationMs : 510_000)
  })

  it('different levels or wide gaps do not conflict', () => {
    const s = tinyScenario({
      flights: [
        { callsign: 'AAA111', pointId: 'P1', appearMs: 0, etaMinAtAppear: 10, fl: 90 },
        { callsign: 'BBB222', pointId: 'P1', appearMs: 0, etaMinAtAppear: 9, fl: 100 },
        { callsign: 'CCC333', pointId: 'P1', appearMs: 0, etaMinAtAppear: 15, fl: 90 }
      ]
    })
    expect(computeEpisodes(s)).toHaveLength(0)
  })

  it('an FL update creates an episode starting at the update', () => {
    const s = tinyScenario({
      flights: [
        { callsign: 'AAA111', pointId: 'P1', appearMs: 0, etaMinAtAppear: 10, fl: 90 },
        { callsign: 'BBB222', pointId: 'P1', appearMs: 0, etaMinAtAppear: 9, fl: 100 }
      ],
      updates: [{ tMs: 45_000, callsign: 'BBB222', newFl: 90 }]
    })
    const eps = computeEpisodes(s)
    expect(eps).toHaveLength(1)
    expect(eps[0].startMs).toBe(45_000)
  })
})

describe('strip-management generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: planned conflicts match the config targets', (d) => {
    const s = generate('planned', d)
    const targets: Record<number, number> = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 9 }
    expect(s.plannedConflicts).toBe(targets[d])
    expect(computeEpisodes(s)).toHaveLength(s.plannedConflicts)
  })

  it.each(DIFFICULTIES)('difficulty %i: every episode starts catchably early', (d) => {
    const s = generate('catchable', d)
    for (const ep of computeEpisodes(s)) {
      expect(ep.startMs).toBeLessThan(s.durationMs - 30_000)
      expect(ep.endMs - ep.startMs).toBeGreaterThan(20_000)
    }
  })

  it('callsigns are unique', () => {
    const s = generate('cs', 4)
    const signs = s.flights.map((f) => f.callsign)
    expect(new Set(signs).size).toBe(signs.length)
  })
})

describe('strip-management scorer', () => {
  it('scores flags within the window, ignores late, counts false ones', () => {
    const s = generate('sc', 2)
    const eps = computeEpisodes(s)
    expect(eps.length).toBeGreaterThan(0)
    const flags = [
      { tMs: eps[0].startMs + 5_000, callsign: eps[0].a }, // hit
      { tMs: eps[0].startMs + 6_000, callsign: eps[0].b }, // duplicate → ignored
      { tMs: 1_000, callsign: 'ZZZ999' } // false flag
    ]
    if (eps.length > 1) {
      // late flag on a real conflict: not a hit, not a false alarm
      flags.push({ tMs: Math.min(eps[1].startMs + s.flagWindowMs + 5_000, eps[1].endMs), callsign: eps[1].a })
    }
    const r = score(s, flags)
    expect(r.items[0].correct).toBe(true)
    expect(r.items[0].rtMs).toBe(5_000)
    if (eps.length > 1) expect(r.items[1].correct).toBe(false)
    expect(r.extra?.falseFlags).toBe(1)
    expect(r.totalItems).toBe(eps.length)
  })

  it('perfect flagging scores 100%', () => {
    const s = generate('perfect', 1)
    const eps = computeEpisodes(s)
    const flags = eps.map((ep) => ({ tMs: ep.startMs + 3_000, callsign: ep.a }))
    const r = score(s, flags)
    expect(r.accuracy).toBe(1)
    expect(r.extra?.falseFlags).toBe(0)
  })
})
