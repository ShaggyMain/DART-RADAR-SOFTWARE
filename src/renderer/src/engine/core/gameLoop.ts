/**
 * Fixed-timestep game loop: update() runs at a constant simulated rate no
 * matter the display refresh (60 Hz and 120 Hz behave identically), render()
 * runs once per animation frame. Simulation code that must be deterministic
 * (shared between generators and views) always steps with FIXED_DT_MS.
 */
export const FIXED_DT_MS = 1000 / 60

export interface LoopHandle {
  stop: () => void
}

interface LoopOptions {
  /** Advance simulation by exactly FIXED_DT_MS of simulated time. */
  update: (dtMs: number, elapsedMs: number) => void
  /** Draw current state; called once per animation frame. */
  render: () => void
  /** Called once when elapsed simulated time reaches durationMs. */
  durationMs?: number
  onDone?: () => void
}

const MAX_FRAME_MS = 250 // clamp huge frame gaps (tab hidden, debugger)

export function startLoop({ update, render, durationMs, onDone }: LoopOptions): LoopHandle {
  let accumulator = 0
  let elapsed = 0
  let last = performance.now()
  let rafId = 0
  let running = true

  const frame = (now: number): void => {
    if (!running) return
    accumulator += Math.min(now - last, MAX_FRAME_MS)
    last = now
    while (accumulator >= FIXED_DT_MS) {
      accumulator -= FIXED_DT_MS
      elapsed += FIXED_DT_MS
      update(FIXED_DT_MS, elapsed)
      if (durationMs !== undefined && elapsed >= durationMs) {
        running = false
        render()
        onDone?.()
        return
      }
    }
    render()
    rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)

  return {
    stop: () => {
      running = false
      cancelAnimationFrame(rafId)
    }
  }
}
