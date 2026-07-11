import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { generate, score, type DartScenario } from './generator'
import { DartSim } from './sim'

describe('radar-dart generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: spawns are structurally valid', (d) => {
    const s = generate('valid', d)
    const fixIds = new Set(s.fixes.map((f) => f.id))
    const callsigns = new Set<string>()
    for (const sp of s.spawns) {
      // entry on a sector edge
      const onEdge = sp.x === 0 || sp.x === s.sectorNm || sp.y === 0 || sp.y === s.sectorNm
      expect(onEdge).toBe(true)
      expect(sp.tMs).toBeLessThan(s.durationMs)
      expect(sp.route.length).toBeGreaterThanOrEqual(1)
      for (const id of sp.route) expect(fixIds.has(id)).toBe(true)
      expect(sp.altitudeFl % 10).toBe(0)
      expect(callsigns.has(sp.callsign)).toBe(false)
      callsigns.add(sp.callsign)
    }
    expect(s.spawns.length).toBeGreaterThanOrEqual(4)
  })

  it('exit fixes differ from the entry edge', () => {
    const s = generate('exits', 2)
    for (const sp of s.spawns) {
      const exit = s.fixes.find((f) => f.id === sp.route[sp.route.length - 1])!
      // exit fix must not sit on the same edge the aircraft entered from
      const entryEdge =
        sp.y === s.sectorNm ? 'N' : sp.y === 0 ? 'S' : sp.x === s.sectorNm ? 'E' : 'W'
      const exitEdge =
        exit.y > 90 ? 'N' : exit.y < 10 ? 'S' : exit.x > 90 ? 'E' : 'W'
      expect(exitEdge).not.toBe(entryEdge)
    }
  })
})

describe('DartSim', () => {
  /** Minimal handcrafted scenario for precise behavioural tests. */
  function tinyScenario(spawns: DartScenario['spawns']): DartScenario {
    return {
      taskId: 'radar-dart',
      seed: 't',
      difficulty: 1,
      sectorNm: 100,
      fixes: [
        { id: 'EXIT-E', x: 97, y: 50 },
        { id: 'MID', x: 50, y: 50 }
      ],
      spawns,
      durationMs: 600_000,
      separationNm: 5,
      separationFl: 10,
      lookaheadS: 60,
      handoffRadiusNm: 5,
      waypointRadiusNm: 3
    }
  }

  function run(sim: DartSim, seconds: number): void {
    for (let i = 0; i < seconds * 10; i++) sim.step(100)
  }

  it('moveScale accelerates only motion: a slow flight that misses its exit at 1x hands off at 6x', () => {
    const mk = (): DartSim =>
      new DartSim(
        tinyScenario([
          // 300 kt from the west edge must cross ~97 NM to EXIT-E — impossible
          // in a 240 s session at real speed, but fine at 6x.
          { tMs: 0, callsign: 'SLOW01', x: 0, y: 50, speedKts: 300, altitudeFl: 200, route: ['EXIT-E'] }
        ])
      )
    const realTime = { ...tinyScenario([]), durationMs: 240_000 }
    const sessionSteps = realTime.durationMs / 100

    const slow = mk()
    for (let i = 0; i < sessionSteps; i++) slow.step(100, 1)
    expect(slow.getLog().handoffs).toHaveLength(0) // too slow to reach the exit

    const fast = mk()
    for (let i = 0; i < sessionSteps; i++) fast.step(100, 6)
    const log = fast.getLog()
    expect(log.handoffs).toHaveLength(1)
    expect(log.handoffs[0]).toEqual({ callsign: 'SLOW01', correctExit: true })
  })

  it('the speed command adjusts speed within the envelope', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 300, altitudeFl: 200, route: ['EXIT-E'] }
      ])
    )
    sim.step(100)
    sim.command('AAA111', { type: 'speed', deltaKts: 20 })
    expect(sim.find('AAA111')!.speedKts).toBe(320)
    for (let i = 0; i < 40; i++) sim.command('AAA111', { type: 'speed', deltaKts: -20 })
    expect(sim.find('AAA111')!.speedKts).toBe(160) // clamped to MIN_SPEED_KTS
  })

  it('spawns aircraft at their scheduled times', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 360, altitudeFl: 200, route: ['EXIT-E'] },
        { tMs: 5000, callsign: 'BBB222', x: 0, y: 30, speedKts: 360, altitudeFl: 220, route: ['EXIT-E'] }
      ])
    )
    sim.step(100)
    expect(sim.aircraft).toHaveLength(1)
    run(sim, 6)
    expect(sim.aircraft).toHaveLength(2)
  })

  it('auto-nav flies the route and hands off at the exit fix', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 480, altitudeFl: 200, route: ['MID', 'EXIT-E'] }
      ])
    )
    // 480 kts ≈ 0.133 nm/s; ~97nm to fly → ~730s
    run(sim, 800)
    expect(sim.aircraft).toHaveLength(0)
    const log = sim.getLog()
    expect(log.handoffs).toEqual([{ callsign: 'AAA111', correctExit: true }])
  })

  it('a vectored aircraft leaves the route until resumed', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 360, altitudeFl: 200, route: ['EXIT-E'] }
      ])
    )
    sim.step(100)
    sim.command('AAA111', { type: 'turn', deltaDeg: -90 })
    const ac = sim.find('AAA111')!
    expect(ac.vectored).toBe(true)
    run(sim, 60)
    // heading should have turned away from east (90°) toward north (0°)
    expect(Math.abs(ac.headingDeg - 90)).toBeGreaterThan(45)
    sim.command('AAA111', { type: 'resume' })
    run(sim, 5)
    expect(ac.vectored).toBe(false)
    // target heading now points back toward the exit fix (east-ish)
    expect(ac.targetHeadingDeg).toBeGreaterThan(45)
    expect(ac.targetHeadingDeg).toBeLessThan(180)
  })

  it('an aircraft vectored out of the sector logs a wrong exit', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 480, altitudeFl: 200, route: ['EXIT-E'] }
      ])
    )
    sim.step(100)
    sim.command('AAA111', { type: 'turn', deltaDeg: -90 }) // due north
    run(sim, 500)
    const log = sim.getLog()
    expect(log.handoffs).toEqual([{ callsign: 'AAA111', correctExit: false }])
  })

  it('altitude commands step in FL10 increments within limits', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 360, altitudeFl: 200, route: ['EXIT-E'] }
      ])
    )
    sim.step(100)
    sim.command('AAA111', { type: 'altitude', deltaFl: 10 })
    expect(sim.find('AAA111')!.targetAltitudeFl).toBe(210)
    for (let i = 0; i < 30; i++) sim.command('AAA111', { type: 'altitude', deltaFl: 10 })
    expect(sim.find('AAA111')!.targetAltitudeFl).toBe(400)
  })

  it('head-on traffic at the same level produces a conflict episode', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 480, altitudeFl: 200, route: ['EXIT-E'] },
        { tMs: 0, callsign: 'BBB222', x: 100, y: 50, speedKts: 480, altitudeFl: 200, route: ['MID', 'EXIT-E'] }
      ])
    )
    run(sim, 400)
    expect(sim.conflictEpisodes).toBeGreaterThanOrEqual(1)
    expect(sim.getLog().timeInConflictMs).toBeGreaterThan(0)
  })

  it('vertically separated traffic does not conflict', () => {
    const sim = new DartSim(
      tinyScenario([
        { tMs: 0, callsign: 'AAA111', x: 0, y: 50, speedKts: 480, altitudeFl: 200, route: ['EXIT-E'] },
        { tMs: 0, callsign: 'BBB222', x: 100, y: 50, speedKts: 480, altitudeFl: 210, route: ['MID', 'EXIT-E'] }
      ])
    )
    run(sim, 400)
    expect(sim.conflictEpisodes).toBe(0)
  })
})

describe('radar-dart scorer', () => {
  it('computes accuracy from handoffs and reports conflict extras', () => {
    const s = generate('sc', 1)
    const r = score(s, {
      handoffs: [
        { callsign: 'A', correctExit: true },
        { callsign: 'B', correctExit: true },
        { callsign: 'C', correctExit: false }
      ],
      conflictEpisodes: 2,
      timeInConflictMs: 12_400,
      remaining: 3
    })
    expect(r.totalItems).toBe(3)
    expect(r.accuracy).toBeCloseTo(2 / 3)
    expect(r.meanRtMs).toBeNull()
    expect(r.extra).toEqual({ conflicts: 2, timeInConflictSec: 12, unfinishedFlights: 3 })
  })

  it('handles an empty log', () => {
    const s = generate('sc0', 1)
    const r = score(s, { handoffs: [], conflictEpisodes: 0, timeInConflictMs: 0, remaining: 5 })
    expect(r.accuracy).toBe(0)
    expect(r.totalItems).toBe(0)
  })
})
