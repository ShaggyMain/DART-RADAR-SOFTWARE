import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { AIRPORTS, generate, score, type MpScenario } from './generator'
import { MultipassSim } from './sim'

describe('multipass generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: spawns and calls valid', (d) => {
    const s = generate('valid', d)
    const callsigns = new Set<string>()
    for (const sp of s.spawns) {
      const onEdge = sp.x === 0 || sp.x === s.sectorNm || sp.y === 0 || sp.y === s.sectorNm
      expect(onEdge).toBe(true)
      expect(['A', 'B']).toContain(sp.destination)
      expect(callsigns.has(sp.callsign)).toBe(false)
      callsigns.add(sp.callsign)
    }
    expect(s.calls.length).toBeGreaterThanOrEqual(5)
    const flying = new Set(s.spawns.map((sp) => sp.callsign))
    const present = s.calls.filter((c) => flying.has(c.callsign)).length
    expect(present).toBeGreaterThan(0)
  })

  it('produces both present and absent audio callsigns across seeds', () => {
    let present = 0
    let absent = 0
    for (const seed of ['a', 'b', 'c']) {
      const s = generate(seed, 3)
      const flying = new Set(s.spawns.map((sp) => sp.callsign))
      for (const c of s.calls) {
        if (flying.has(c.callsign)) present++
        else absent++
      }
    }
    expect(present).toBeGreaterThan(0)
    expect(absent).toBeGreaterThan(0)
  })
})

describe('MultipassSim', () => {
  function tinyScenario(spawns: MpScenario['spawns']): MpScenario {
    return {
      taskId: 'multipass',
      seed: 't',
      difficulty: 1,
      sectorNm: 100,
      airports: AIRPORTS,
      spawns,
      calls: [],
      durationMs: 600_000,
      separationNm: 4,
      landRadiusNm: 4,
      reportRadiusNm: 12,
      reportWindowMs: 12_000,
      matchWindowMs: 5_000
    }
  }

  function run(sim: MultipassSim, seconds: number): void {
    for (let i = 0; i < seconds * 10; i++) sim.step(100)
  }

  it('a cleared aircraft flies to the airport and lands correctly', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 80, headingDeg: 120, speedKts: 300, destination: 'A' }
      ]),
      12_000
    )
    sim.step(100)
    sim.command('AAA111', { type: 'clear', airport: 'A' })
    run(sim, 600)
    const log = sim.buildLog([], 0)
    expect(log.outcomes).toEqual([{ callsign: 'AAA111', landedCorrect: true }])
  })

  it('clearing to the wrong airport lands incorrectly', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 80, headingDeg: 120, speedKts: 300, destination: 'B' }
      ]),
      12_000
    )
    sim.step(100)
    sim.command('AAA111', { type: 'clear', airport: 'A' })
    run(sim, 600)
    expect(sim.buildLog([], 0).outcomes[0].landedCorrect).toBe(false)
  })

  it('an uncleared aircraft drifts out of the sector as unhandled', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, headingDeg: 90, speedKts: 480, destination: 'A' }
      ]),
      12_000
    )
    run(sim, 900)
    const log = sim.buildLog([], 0)
    expect(log.outcomes).toEqual([{ callsign: 'AAA111', landedCorrect: false }])
  })

  it('REPORT becomes due near the cleared airport and can be acked in time', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, headingDeg: 90, speedKts: 300, destination: 'A' }
      ]),
      12_000
    )
    sim.step(100)
    sim.command('AAA111', { type: 'clear', airport: 'A' })
    // 300 kt ≈ 0.083 nm/s; report due once within 12nm of the airport at
    // x=22, i.e. after ~120s of the 22nm leg — ack inside the 12s window
    run(sim, 122)
    expect(sim.find('AAA111')!.reportState).toBe('due')
    expect(sim.ackReport('AAA111')).toBe(true)
    run(sim, 400)
    const log = sim.buildLog([], 0)
    expect(log.reports).toEqual([{ callsign: 'AAA111', acked: true }])
    expect(log.outcomes[0].landedCorrect).toBe(true)
  })

  it('an unacked REPORT is logged as missed after the window', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, headingDeg: 90, speedKts: 300, destination: 'A' }
      ]),
      8_000
    )
    sim.step(100)
    sim.command('AAA111', { type: 'clear', airport: 'A' })
    run(sim, 300)
    const log = sim.buildLog([], 0)
    expect(log.reports).toEqual([{ callsign: 'AAA111', acked: false }])
  })

  it('two aircraft close together trigger a lateral conflict', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, headingDeg: 90, speedKts: 300, destination: 'A' },
        { tMs: 0, callsign: 'BBB222', x: 0, y: 53, headingDeg: 90, speedKts: 300, destination: 'B' }
      ]),
      12_000
    )
    run(sim, 30)
    expect(sim.conflictEpisodes).toBeGreaterThanOrEqual(1)
  })

  it('vector overrides navigation until resume', () => {
    const sim = new MultipassSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, headingDeg: 90, speedKts: 300, destination: 'A' }
      ]),
      12_000
    )
    sim.step(100)
    sim.command('AAA111', { type: 'clear', airport: 'A' })
    sim.command('AAA111', { type: 'turn', deltaDeg: -60 })
    const ac = sim.find('AAA111')!
    expect(ac.vectored).toBe(true)
    run(sim, 30)
    sim.command('AAA111', { type: 'resume' })
    sim.step(100)
    expect(ac.vectored).toBe(false)
  })
})

describe('multipass scorer', () => {
  it('aggregates landings, reports and audio', () => {
    const s = generate('sc', 1)
    const r = score(s, {
      outcomes: [
        { callsign: 'A', landedCorrect: true },
        { callsign: 'B', landedCorrect: false }
      ],
      conflictEpisodes: 3,
      timeInConflictMs: 8000,
      remaining: 1,
      reports: [
        { callsign: 'A', acked: true },
        { callsign: 'B', acked: false }
      ],
      audio: [
        { callsign: 'A', present: true, matched: true },
        { callsign: 'X', present: false, matched: true }
      ],
      falseMatches: 2
    })
    expect(r.accuracy).toBe(0.5)
    expect(r.extra?.reportAccuracy).toBe(0.5)
    expect(r.extra?.audioAccuracy).toBe(0.5)
    expect(r.extra?.falseAlarms).toBe(2)
  })
})
