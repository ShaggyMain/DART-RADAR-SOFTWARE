import { Rng } from '@shared/rng'
import { buildResult } from '@shared/scoring'
import type {
  Difficulty,
  ItemOutcome,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'
import { FIXED_DT_MS } from '../../core/gameLoop'

/**
 * Divided Attention — multi-panel contact detection. Each panel contains a
 * wandering dot and an oscillating bar; when they touch, press that panel's
 * number key. Ground-truth contact times are PRE-SIMULATED by the generator
 * with the same fixed-timestep code the view runs, so they match exactly.
 */
export interface DotSpec {
  x0: number
  y0: number
  /** Initial direction, radians. */
  dir0: number
  /** Units (panel = 100x100) per second. */
  speed: number
  /** Scheduled direction changes. */
  changes: { tMs: number; dir: number }[]
}

export interface BarSpec {
  /** Fixed x of the vertical bar. */
  x: number
  halfLen: number
  /** Center y oscillates: 50 + amplitude * sin(2π t/period + phase). */
  amplitude: number
  periodMs: number
  phase: number
}

export interface PanelSpec {
  dot: DotSpec
  bar: BarSpec
}

export interface DAEvent {
  panel: number
  tMs: number
}

export interface DividedAttentionScenario extends ScenarioBase {
  taskId: 'divided-attention'
  panels: PanelSpec[]
  /** Ground-truth contact events (pre-simulated). */
  events: DAEvent[]
  durationMs: number
  responseWindowMs: number
  contactTolerance: number
}

export interface PanelPress {
  tMs: number
  panel: number
}

const BOUND_LO = 6
const BOUND_HI = 94
/** Min time between two scored contacts in the same panel. */
const EVENT_COOLDOWN_MS = 2500

interface Config {
  panels: number
  dotSpeed: number
  tolerance: number
  responseWindowMs: number
  durationMs: number
  minEventsPerPanel: number
  maxEventsTotal: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { panels: 2, dotSpeed: 20, tolerance: 5, responseWindowMs: 2000, durationMs: 60_000, minEventsPerPanel: 2, maxEventsTotal: 14 },
  2: { panels: 3, dotSpeed: 24, tolerance: 5, responseWindowMs: 1800, durationMs: 75_000, minEventsPerPanel: 2, maxEventsTotal: 18 },
  3: { panels: 4, dotSpeed: 28, tolerance: 5, responseWindowMs: 1700, durationMs: 90_000, minEventsPerPanel: 2, maxEventsTotal: 22 },
  4: { panels: 6, dotSpeed: 32, tolerance: 4.5, responseWindowMs: 1600, durationMs: 105_000, minEventsPerPanel: 1, maxEventsTotal: 26 },
  5: { panels: 9, dotSpeed: 36, tolerance: 4.5, responseWindowMs: 1500, durationMs: 120_000, minEventsPerPanel: 1, maxEventsTotal: 32 }
}

/* ------------------------------------------------------------------ */
/* Deterministic simulation (shared by generator, view and tests)      */
/* ------------------------------------------------------------------ */

export interface PanelState {
  x: number
  y: number
  vx: number
  vy: number
  elapsedMs: number
  changeCursor: number
}

export function createPanelState(spec: PanelSpec): PanelState {
  return {
    x: spec.dot.x0,
    y: spec.dot.y0,
    vx: Math.cos(spec.dot.dir0) * spec.dot.speed,
    vy: Math.sin(spec.dot.dir0) * spec.dot.speed,
    elapsedMs: 0,
    changeCursor: 0
  }
}

export function barCenterY(spec: BarSpec, tMs: number): number {
  return 50 + spec.amplitude * Math.sin((2 * Math.PI * tMs) / spec.periodMs + spec.phase)
}

export function stepPanel(spec: PanelSpec, state: PanelState, dtMs: number): void {
  state.elapsedMs += dtMs
  const changes = spec.dot.changes
  while (state.changeCursor < changes.length && state.elapsedMs >= changes[state.changeCursor].tMs) {
    const dir = changes[state.changeCursor].dir
    state.vx = Math.cos(dir) * spec.dot.speed
    state.vy = Math.sin(dir) * spec.dot.speed
    state.changeCursor++
  }
  state.x += (state.vx * dtMs) / 1000
  state.y += (state.vy * dtMs) / 1000
  if (state.x < BOUND_LO) {
    state.x = BOUND_LO + (BOUND_LO - state.x)
    state.vx = -state.vx
  } else if (state.x > BOUND_HI) {
    state.x = BOUND_HI - (state.x - BOUND_HI)
    state.vx = -state.vx
  }
  if (state.y < BOUND_LO) {
    state.y = BOUND_LO + (BOUND_LO - state.y)
    state.vy = -state.vy
  } else if (state.y > BOUND_HI) {
    state.y = BOUND_HI - (state.y - BOUND_HI)
    state.vy = -state.vy
  }
}

export function isInContact(spec: PanelSpec, state: PanelState, tolerance: number): boolean {
  const yc = barCenterY(spec.bar, state.elapsedMs)
  const nearestY = Math.max(yc - spec.bar.halfLen, Math.min(yc + spec.bar.halfLen, state.y))
  return Math.hypot(state.x - spec.bar.x, state.y - nearestY) < tolerance
}

/** Full pre-simulation of one panel, returning scored contact times. */
export function simulatePanelEvents(
  spec: PanelSpec,
  durationMs: number,
  tolerance: number
): number[] {
  const state = createPanelState(spec)
  const events: number[] = []
  let inContact = false
  let cooldownUntil = -1
  for (let t = 0; t < durationMs; t += FIXED_DT_MS) {
    stepPanel(spec, state, FIXED_DT_MS)
    const contact = isInContact(spec, state, tolerance)
    if (contact && !inContact && state.elapsedMs >= cooldownUntil) {
      events.push(state.elapsedMs)
      cooldownUntil = state.elapsedMs + EVENT_COOLDOWN_MS
    }
    inContact = contact
  }
  return events
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

function makePanelSpec(rng: Rng, cfg: Config): PanelSpec {
  const changes: { tMs: number; dir: number }[] = []
  let t = 0
  while (t < cfg.durationMs) {
    t += rng.float(1500, 3500)
    changes.push({ tMs: t, dir: rng.float(0, Math.PI * 2) })
  }
  return {
    dot: {
      x0: rng.float(15, 85),
      y0: rng.float(15, 85),
      dir0: rng.float(0, Math.PI * 2),
      speed: cfg.dotSpeed,
      changes
    },
    bar: {
      x: rng.float(25, 75),
      halfLen: rng.float(11, 17),
      amplitude: rng.float(16, 30),
      periodMs: rng.float(3000, 7000),
      phase: rng.float(0, Math.PI * 2)
    }
  }
}

export function generate(seed: string, difficulty: Difficulty): DividedAttentionScenario {
  const rng = new Rng(`divided-attention:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]

  let best: { panels: PanelSpec[]; events: DAEvent[] } | null = null
  for (let attempt = 0; attempt < 25; attempt++) {
    const panels = Array.from({ length: cfg.panels }, () => makePanelSpec(rng, cfg))
    const events: DAEvent[] = []
    const perPanel: number[] = []
    panels.forEach((spec, p) => {
      const times = simulatePanelEvents(spec, cfg.durationMs, cfg.tolerance)
      perPanel.push(times.length)
      for (const tMs of times) events.push({ panel: p, tMs })
    })
    events.sort((a, b) => a.tMs - b.tMs)
    const candidate = { panels, events }
    if (!best || events.length > best.events.length) best = candidate
    if (
      perPanel.every((n) => n >= cfg.minEventsPerPanel) &&
      events.length <= cfg.maxEventsTotal &&
      events.length >= cfg.panels * cfg.minEventsPerPanel
    ) {
      best = candidate
      break
    }
  }

  return {
    taskId: 'divided-attention',
    seed,
    difficulty,
    panels: best!.panels,
    events: best!.events,
    durationMs: cfg.durationMs,
    responseWindowMs: cfg.responseWindowMs,
    contactTolerance: cfg.tolerance
  }
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export function score(scenario: DividedAttentionScenario, presses: PanelPress[]): TaskResult {
  const sorted = presses.slice().sort((a, b) => a.tMs - b.tMs)
  const used = new Array<boolean>(sorted.length).fill(false)

  const items: ItemOutcome[] = scenario.events.map((event, index) => {
    for (let p = 0; p < sorted.length; p++) {
      if (used[p] || sorted[p].panel !== event.panel) continue
      const dt = sorted[p].tMs - event.tMs
      if (dt >= 0 && dt <= scenario.responseWindowMs) {
        used[p] = true
        return { index, correct: true, rtMs: dt, timedOut: false }
      }
    }
    return { index, correct: false, rtMs: 0, timedOut: true }
  })

  const falseAlarms = used.filter((u) => !u).length
  return buildResult(scenario.taskId, items, { falseAlarms })
}

export const dividedAttentionLogic: TaskLogic<DividedAttentionScenario, PanelPress[]> = {
  taskId: 'divided-attention',
  generate,
  score
}
