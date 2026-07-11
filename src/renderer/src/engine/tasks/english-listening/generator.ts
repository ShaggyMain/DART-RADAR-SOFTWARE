import { Rng } from '@shared/rng'
import { scoreMultipleChoice } from '@shared/scoring'
import type {
  Difficulty,
  ItemResponse,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * English Listening & Comprehension (ELICIT-style). Original template
 * passages with procedurally filled slots — every run has different
 * destinations, gates, times and figures, so the questions can't be
 * memorised. Aviation-flavoured, but no ATC knowledge required.
 */
export interface ListeningQuestion {
  prompt: string
  options: string[]
  correctIndex: number
  /** Which slot this question asks about (kept for tests). */
  slot: string
  timeLimitMs: number
}

export interface ListeningItem {
  templateId: string
  /** Full passage with slots filled; used for TTS and the no-audio fallback. */
  text: string
  /** Slot assignments (kept for tests/debugging). */
  slotValues: Record<string, string>
  /** TTS speech rate. */
  rate: number
  /** Additional plays allowed after the first one. */
  replaysAllowed: number
  questions: ListeningQuestion[]
}

export interface ListeningScenario extends ScenarioBase {
  taskId: 'english-listening'
  items: ListeningItem[]
}

/* ------------------------------------------------------------------ */
/* Original content pools and templates                                 */
/* ------------------------------------------------------------------ */

const POOLS: Record<string, string[]> = {
  CITY: ['Malaga', 'Bergen', 'Porto', 'Tallinn', 'Lyon', 'Catania', 'Aberdeen', 'Valencia'],
  DAY: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  TIME: ['8:15', '9:30', '10:45', '11:20', '12:40', '14:10', '15:35', '16:50', '18:05', '19:25'],
  GATE: ['A2', 'B4', 'C7', 'D12', 'E9', 'F3'],
  FNUM: ['118', '274', '356', '482', '561', '630', '715', '847'],
  MIN: ['10', '15', '20', '25', '30', '40'],
  VIS: ['2', '3', '4', '5', '6', '8'],
  DIR: ['north', 'south', 'east', 'west', 'northwest', 'southeast'],
  SPD: ['8', '12', '15', '18', '22', '25'],
  HOURS: ['2', '3', '4', '5', '6'],
  ROOM: ['104', '210', '316', '428', '532'],
  LEVEL: ['1', '2', '3', '4'],
  STOP: ['B', 'C', 'E', 'H'],
  PARK: ['P1', 'P2', 'P3', 'P4'],
  COUNT: ['40', '60', '75', '90', '120'],
  PCT: ['70', '80', '85', '90', '95'],
  BELT: ['3', '5', '7', '9', '11'],
  COUNTER: ['A', 'C', 'D', 'F'],
  SECTOR: ['North', 'South', 'East', 'West']
}

export interface Template {
  id: string
  text: string
  /** slot name → pool name */
  slots: Record<string, string>
  questions: { prompt: string; slot: string }[]
}

/** Exported for tests (pool-collision invariants). */
export const TEMPLATES: Template[] = [
  {
    id: 'gate-change',
    text: 'Attention please. Flight {FNUM} to {CITY} will now depart from gate {GATE2} instead of gate {GATE1}. Boarding starts at {TIME}. Passengers who need assistance should contact the staff at gate {GATE2} at least {MIN} minutes before boarding.',
    slots: { FNUM: 'FNUM', CITY: 'CITY', GATE1: 'GATE', GATE2: 'GATE', TIME: 'TIME', MIN: 'MIN' },
    questions: [
      { prompt: 'Where is the flight going?', slot: 'CITY' },
      { prompt: 'Which gate does the flight NOW depart from?', slot: 'GATE2' },
      { prompt: 'At what time does boarding start?', slot: 'TIME' },
      { prompt: 'How many minutes before boarding should passengers ask for assistance?', slot: 'MIN' }
    ]
  },
  {
    id: 'weather',
    text: 'Good afternoon. Here is the airfield update for {DAY}. Visibility is currently {VIS} kilometres and is expected to improve after {TIME}. The wind is from the {DIR} at {SPD} knots. Runway inspections will take place every {HOURS} hours during the day.',
    slots: { DAY: 'DAY', VIS: 'VIS', TIME: 'TIME', DIR: 'DIR', SPD: 'SPD', HOURS: 'HOURS' },
    questions: [
      { prompt: 'What is the current visibility in kilometres?', slot: 'VIS' },
      { prompt: 'Which direction is the wind coming from?', slot: 'DIR' },
      { prompt: 'What is the wind speed in knots?', slot: 'SPD' },
      { prompt: 'How often do the runway inspections take place? Every … hours', slot: 'HOURS' }
    ]
  },
  {
    id: 'shuttle',
    text: 'May I have your attention. The staff shuttle between the terminal and the training centre now runs every {MIN} minutes. The first departure is at {TIME1} and the last one at {TIME2}. Please wait at stop {STOP}, next to car park {PARK}.',
    slots: { MIN: 'MIN', TIME1: 'TIME', TIME2: 'TIME', STOP: 'STOP', PARK: 'PARK' },
    questions: [
      { prompt: 'How often does the shuttle run? every ... minutes', slot: 'MIN' },
      { prompt: 'When is the FIRST departure?', slot: 'TIME1' },
      { prompt: 'At which stop should you wait?', slot: 'STOP' },
      { prompt: 'Which car park is the stop next to?', slot: 'PARK' }
    ]
  },
  {
    id: 'briefing-move',
    text: 'Attention all candidates. The selection briefing planned for {DAY1} has been moved to {DAY2} at {TIME}. It will take place in room {ROOM} on level {LEVEL}. Please bring a valid identity document and arrive {MIN} minutes early.',
    slots: { DAY1: 'DAY', DAY2: 'DAY', TIME: 'TIME', ROOM: 'ROOM', LEVEL: 'LEVEL', MIN: 'MIN' },
    questions: [
      { prompt: 'On which day does the briefing NOW take place?', slot: 'DAY2' },
      { prompt: 'In which room is the briefing?', slot: 'ROOM' },
      { prompt: 'At what time does the briefing start?', slot: 'TIME' },
      { prompt: 'How many minutes early should candidates arrive?', slot: 'MIN' }
    ]
  },
  {
    id: 'exercise-summary',
    text: "Yesterday's control-room exercise lasted {HOURS} hours. The team handled {COUNT} simulated flights, and the busiest period began at {TIME1}. Overall, {PCT} percent of the flights arrived on schedule. The next exercise takes place on {DAY}.",
    slots: { HOURS: 'HOURS', COUNT: 'COUNT', TIME1: 'TIME', PCT: 'PCT', DAY: 'DAY' },
    questions: [
      { prompt: 'How many simulated flights were handled?', slot: 'COUNT' },
      { prompt: 'What percentage of flights arrived on schedule?', slot: 'PCT' },
      { prompt: 'When did the busiest period begin?', slot: 'TIME1' },
      { prompt: 'On which day is the next exercise?', slot: 'DAY' }
    ]
  },
  {
    id: 'baggage',
    text: 'Passengers arriving from {CITY} can collect their baggage from belt {BELT}. Oversized items will be delivered to counter {COUNTER} approximately {MIN} minutes after landing. For missing items, the service desk is open until {TIME}.',
    slots: { CITY: 'CITY', BELT: 'BELT', COUNTER: 'COUNTER', MIN: 'MIN', TIME: 'TIME' },
    questions: [
      { prompt: 'Which belt has the baggage from this arrival?', slot: 'BELT' },
      { prompt: 'To which counter will oversized items be delivered?', slot: 'COUNTER' },
      { prompt: 'Until what time is the service desk open?', slot: 'TIME' },
      { prompt: 'From which city did the flight arrive?', slot: 'CITY' }
    ]
  },
  {
    id: 'maintenance',
    text: 'Please note that the main radar display in sector {SECTOR} will be under maintenance on {DAY} between {TIME1} and {TIME2}. During this period, controllers should use the backup console in room {ROOM}. Normal operation resumes at {TIME2}.',
    slots: { SECTOR: 'SECTOR', DAY: 'DAY', TIME1: 'TIME', TIME2: 'TIME', ROOM: 'ROOM' },
    questions: [
      { prompt: 'Which sector is affected by the maintenance?', slot: 'SECTOR' },
      { prompt: 'On which day is the maintenance?', slot: 'DAY' },
      { prompt: 'In which room is the backup console?', slot: 'ROOM' },
      { prompt: 'At what time does normal operation resume?', slot: 'TIME2' }
    ]
  },
  {
    id: 'final-call',
    text: 'This is the final call for flight {FNUM} to {CITY}. All remaining passengers must proceed immediately to gate {GATE}. The aircraft doors close in {MIN} minutes. We wish you a pleasant journey.',
    slots: { FNUM: 'FNUM', CITY: 'CITY', GATE: 'GATE', MIN: 'MIN' },
    questions: [
      { prompt: 'What is the flight number?', slot: 'FNUM' },
      { prompt: 'To which gate must passengers proceed?', slot: 'GATE' },
      { prompt: 'In how many minutes do the doors close?', slot: 'MIN' }
    ]
  }
]

interface Config {
  passages: number
  questionsPerPassage: number
  rate: number
  replaysAllowed: number
  questionTimeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { passages: 4, questionsPerPassage: 2, rate: 0.95, replaysAllowed: 1, questionTimeLimitMs: 20_000 },
  2: { passages: 4, questionsPerPassage: 2, rate: 1.0, replaysAllowed: 1, questionTimeLimitMs: 18_000 },
  3: { passages: 5, questionsPerPassage: 3, rate: 1.0, replaysAllowed: 0, questionTimeLimitMs: 16_000 },
  4: { passages: 5, questionsPerPassage: 3, rate: 1.1, replaysAllowed: 0, questionTimeLimitMs: 14_000 },
  5: { passages: 5, questionsPerPassage: 4, rate: 1.15, replaysAllowed: 0, questionTimeLimitMs: 12_000 }
}

function fillTemplate(rng: Rng, template: Template, cfg: Config): ListeningItem {
  // Values already used per POOL (not per slot) — a distractor must never
  // equal ANY passage value drawn from the same pool, or the answer could
  // be argued two ways.
  const usedByPool = new Map<string, Set<string>>()
  const slotValues: Record<string, string> = {}

  for (const [slot, poolName] of Object.entries(template.slots)) {
    const pool = POOLS[poolName]
    const used = usedByPool.get(poolName) ?? new Set<string>()
    const available = pool.filter((v) => !used.has(v))
    const value = rng.pick(available)
    used.add(value)
    usedByPool.set(poolName, used)
    slotValues[slot] = value
  }

  let text = template.text
  for (const [slot, value] of Object.entries(slotValues)) {
    text = text.split(`{${slot}}`).join(value)
  }

  const chosen = rng.sample(
    template.questions,
    Math.min(cfg.questionsPerPassage, template.questions.length)
  )
  const questions: ListeningQuestion[] = chosen.map((q) => {
    const poolName = template.slots[q.slot]
    const pool = POOLS[poolName]
    const usedValues = usedByPool.get(poolName) ?? new Set<string>()
    const correct = slotValues[q.slot]
    const distractors = rng.sample(
      pool.filter((v) => !usedValues.has(v)),
      3
    )
    const options = rng.shuffle([correct, ...distractors])
    return {
      prompt: q.prompt,
      options,
      correctIndex: options.indexOf(correct),
      slot: q.slot,
      timeLimitMs: cfg.questionTimeLimitMs
    }
  })

  return {
    templateId: template.id,
    text,
    slotValues,
    rate: cfg.rate,
    replaysAllowed: cfg.replaysAllowed,
    questions
  }
}

export function generate(seed: string, difficulty: Difficulty): ListeningScenario {
  const rng = new Rng(`english-listening:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const templates = rng.sample(TEMPLATES, cfg.passages)
  return {
    taskId: 'english-listening',
    seed,
    difficulty,
    items: templates.map((t) => fillTemplate(rng, t, cfg))
  }
}

/** Responses flattened across passages, question order preserved. */
export function score(scenario: ListeningScenario, responses: ItemResponse[]): TaskResult {
  const correctIndices = scenario.items.flatMap((i) => i.questions.map((q) => q.correctIndex))
  return scoreMultipleChoice(scenario.taskId, correctIndices, responses)
}

export const englishListeningLogic: TaskLogic<ListeningScenario, ItemResponse[]> = {
  taskId: 'english-listening',
  generate,
  score
}
