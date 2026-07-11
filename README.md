# VectorMind

An **independent desktop practice tool** for the cognitive abilities screened in
air-traffic-controller aptitude selection (FEAST-style skills, e.g. the PAŻP/PANSA
process): attention, memory, spatial orientation, planning and multitasking.

> **Disclaimer** — VectorMind is not affiliated with, endorsed by, or connected to
> EUROCONTROL (FEAST), PANSA/PAŻP, SkyTest, or any test vendor. Every exercise is an
> original, procedurally generated design that trains underlying abilities; nothing
> reproduces real test items, layouts or content. Practice scores are training
> feedback only and do not predict official results. Timings are configurable
> estimates from public candidate reports — no official values exist.

## Tech stack

- **Electron + TypeScript + React**, built with **electron-vite**
- State: **Zustand** · Settings persistence: **electron-store**
- Results history: **node:sqlite** (SQLite bundled with Electron's Node —
  chosen over better-sqlite3 to avoid native-module ABI rebuilds between
  dev, tests and packaging; same synchronous prepared-statement API)
- Security: `contextIsolation: true`, `nodeIntegration: false`, typed
  `contextBridge` IPC only
- Tests: **Vitest** (every generator/scorer is pure and unit-tested; the
  storage layer is Electron-free and tested against in-memory databases)

## Development

```bash
npm install
npm run dev        # HMR development window
npm run test       # unit tests
npm run typecheck  # strict TS across main/preload/renderer
npm run build      # production build into out/
```

> In restricted networks the Electron binary download from GitHub may fail during
> `npm install`. Re-run it with a mirror:
> `ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/" node node_modules/electron/install.js`

## Architecture

```
src/
  main/       Electron main: window, IPC handlers, settings + results storage
              (storage/db.ts: sessions/items/profiles/skill_state schema)
  preload/    typed contextBridge API (window.vectormind)
  shared/     pure, dependency-free core: seeded RNG (mulberry32),
              task contracts, scoring, glyphs, geometry, number-words
  renderer/
    src/app/        shell, routing, styles
    src/pages/      Dashboard, TaskPage, Settings
    src/components/ shared UI (options, countdowns, SVG primitives)
    src/engine/
      core/         item runner, countdowns, speech helper
      tasks/<id>/   generator.ts (pure) + generator.test.ts + View.tsx
```

**Determinism:** every scenario comes from `generate(seed, difficulty)` — a pure
function over a seeded PRNG. The same seed always reproduces the identical session;
`Math.random` is never used in task logic.

## Task modules

| Module | Trains | Status |
| --- | --- | --- |
| Matching Figures | perceptual comparison speed | ✅ M2 |
| Spot the Side | left/right perspective-taking | ✅ M2 |
| Cube Folding | 3D visualisation (real fold mechanics) | ✅ M2 |
| Coordinate System | distance/heading/turn estimation | ✅ M2 |
| Landing Sequence | rule-based planning | ✅ M2 |
| Symbol Rules | learning & applying changing rules | ✅ M2 |
| Instrument Recall | visual short-term memory | ✅ M2 |
| Pictogram Memory | memory under interference | ✅ M2 |
| Number Recall | auditory number memory (TTS) | ✅ M2 |
| Vigilance | sustained signal detection | ✅ M4 |
| Divided Attention | multi-panel event monitoring | ✅ M4 |
| Multi Attention | triple-stream multitasking (+ audio) | ✅ M4 |
| Conflict Scan | head-on conflict detection at a glance | ✅ M4 |
| Radar — Conflict Avoidance (DART-style) | live separation + route keeping | ✅ M5 |
| Multipass — Approach Control | routing + strips + audio callsigns | ✅ M5 |
| Radar Control — Gates | manual vectoring + efficiency + radio checks | ✅ M5 |
| Strip Management | conflict detection from strip data | ✅ M5 |
| English Listening | listening comprehension (template passages + TTS) | ✅ M6 |

## Roadmap

- **M1 — Foundation** ✅ scaffold, secure IPC, settings persistence, seeded RNG + tests
- **M2 — Static generators** ✅ nine FEAST-I-style tasks with pure generate/score + tests + views
- **M3 — Session engine** ✅ results storage (node:sqlite), session save pipeline with
  personal percentiles, statistics dashboard (trends, history, overview)
- **M4 — Real-time engine** ✅ fixed-timestep loop (frame-rate independent), Canvas
  rendering, four attention tasks with pre-simulated deterministic ground truth
- **M5 — Simulations** ✅ four FEAST-II-style work-samples on the shared aircraft
  kinematics core (deterministic sims, pure scorers over event logs, NATO-phonetic
  TTS audio sub-tasks with visual fallback)
- **M6 — English listening** ✅ original template passages with procedural slot-filling
  (destinations, gates, times change every run), TTS playback with replay budget and a
  text fallback when audio is off
- **M7 — Adaptive difficulty & exam simulation** ✅ per-task recommended difficulty
  (raise >85% rolling accuracy, lower <60%), "Recommended now" training suggestions,
  and chained exam mode (short/full blueprints, locked settings, mandatory breaks,
  no feedback until a stanine-style practice summary)
- **M8 — Packaging** ⏳ electron-builder Windows installer, profiles, accessibility, QA
