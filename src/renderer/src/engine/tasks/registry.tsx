import type { Difficulty, ScenarioBase, TaskCategory, TaskId, TaskResult } from '@shared/types'
import type { TaskViewProps } from './taskView'

import { bigNumbersLogic } from './big-numbers/generator'
import { BigNumbersView } from './big-numbers/View'
import { conflictScanLogic } from './conflict-scan/generator'
import { ConflictScanView } from './conflict-scan/View'
import { dividedAttentionLogic } from './divided-attention/generator'
import { DividedAttentionView } from './divided-attention/View'
import { englishListeningLogic } from './english-listening/generator'
import { EnglishListeningView } from './english-listening/View'
import { multiAttentionLogic } from './multi-attention/generator'
import { MultiAttentionView } from './multi-attention/View'
import { multipassLogic } from './multipass/generator'
import { MultipassView } from './multipass/View'
import { radarControlLogic } from './radar-control/generator'
import { RadarControlView } from './radar-control/View'
import { radarDartLogic } from './radar-dart/generator'
import { RadarDartView } from './radar-dart/View'
import { stripManagementLogic } from './strip-management/generator'
import { StripManagementView } from './strip-management/View'
import { vigilanceLogic } from './vigilance/generator'
import { VigilanceView } from './vigilance/View'
import { coordinateSystemLogic } from './coordinate-system/generator'
import { CoordinateSystemView } from './coordinate-system/View'
import { cubeFoldingLogic } from './cube-folding/generator'
import { CubeFoldingView } from './cube-folding/View'
import { matchingFigureLogic } from './matching-figure/generator'
import { MatchingFigureView } from './matching-figure/View'
import { memorizeInstrumentsLogic } from './memorize-instruments/generator'
import { MemorizeInstrumentsView } from './memorize-instruments/View'
import { memorizePictogramsLogic } from './memorize-pictograms/generator'
import { MemorizePictogramsView } from './memorize-pictograms/View'
import { planningLogic } from './planning/generator'
import { PlanningView } from './planning/View'
import { ruleApplicationLogic } from './rule-application/generator'
import { RuleApplicationView } from './rule-application/View'
import { spotSideLogic } from './spot-the-side/generator'
import { SpotTheSideView } from './spot-the-side/View'

export interface TaskEntry {
  id: TaskId
  name: string
  category: TaskCategory
  shortDesc: string
  instructions: string[]
  /** Labels for extra result metrics shown on the summary screen. */
  extraLabels?: Record<string, string>
  generate: (seed: string, difficulty: Difficulty) => ScenarioBase
  View: React.ComponentType<TaskViewProps<never>>
}

/* Views are registered through a narrowing cast: each View's scenario type
 * is produced exclusively by its own generator right next to it in the
 * task page, so the pairing is safe by construction. */
function entry<S extends ScenarioBase>(
  e: Omit<TaskEntry, 'generate' | 'View'> & {
    generate: (seed: string, difficulty: Difficulty) => S
    View: React.ComponentType<TaskViewProps<S>>
  }
): TaskEntry {
  return e as unknown as TaskEntry
}

export const TASKS: TaskEntry[] = [
  entry({
    id: 'vigilance',
    name: 'Vigilance',
    category: 'attention',
    shortDesc: 'Catch the marker’s irregular double steps over minutes.',
    instructions: [
      'A marker steps around a ring at a steady rhythm. Occasionally it makes an irregular DOUBLE step.',
      'Press SPACE the instant you see a double step. Pressing at any other time counts as a false alarm.',
      'This is a sustained task — it runs continuously for a few minutes. The timing preset widens the response window but never slows the rhythm.'
    ],
    extraLabels: { falseAlarms: 'False alarms' },
    generate: vigilanceLogic.generate,
    View: VigilanceView
  }),
  entry({
    id: 'divided-attention',
    name: 'Divided Attention',
    category: 'attention',
    shortDesc: 'Monitor several panels; react when dot and bar touch.',
    instructions: [
      'Each panel contains a moving dot and a sliding bar. When they touch in a panel, press that panel’s number key (or click the panel).',
      'Touches can happen in any panel at any time — keep scanning all of them.',
      'Hits, misses, wrong-panel presses and reaction times are all scored.'
    ],
    extraLabels: { falseAlarms: 'False alarms' },
    generate: dividedAttentionLogic.generate,
    View: DividedAttentionView
  }),
  entry({
    id: 'multi-attention',
    name: 'Multi Attention',
    category: 'attention',
    shortDesc: 'Shapes, arithmetic and sound cues — all at once.',
    instructions: [
      'Three streams run at the same time: two figures (press H when identical), an equation (press J if true, K if false), and sporadic beeps (press L when you hear one). Each panel also has on-screen buttons you can click instead of the keys.',
      'Every equation must be answered; figures only need an input when they MATCH.',
      'At difficulty 1 the sound stream is off; from difficulty 2 all three run together.'
    ],
    extraLabels: {
      shapeAccuracy: 'Figures accuracy',
      mathAccuracy: 'Equations accuracy',
      soundAccuracy: 'Sound accuracy',
      falseAlarms: 'Sound false alarms'
    },
    generate: multiAttentionLogic.generate,
    View: MultiAttentionView
  }),
  entry({
    id: 'conflict-scan',
    name: 'Conflict Scan',
    category: 'attention',
    shortDesc: 'Spot head-on collision courses in a brief glimpse.',
    instructions: [
      'A field of aircraft (triangles) appears for a few seconds. Decide whether any two point DIRECTLY AT EACH OTHER — a strict head-on course.',
      'Aircraft merely being close, or one pointing at another that looks away, is NOT a conflict.',
      'Answer with C (conflict) or N (no conflict). You may answer while the field is still visible.'
    ],
    generate: conflictScanLogic.generate,
    View: ConflictScanView
  }),
  entry({
    id: 'matching-figure',
    name: 'Matching Figures',
    category: 'spatial',
    shortDesc: 'Rapidly judge which candidate figure matches the reference.',
    instructions: [
      'A reference figure appears at the top with several candidates below.',
      'Exactly one candidate matches the reference. At higher difficulty, rotated copies count as matches — read the on-screen rule for each item.',
      'Answer as fast as you can without guessing: accuracy and speed are both scored. Use number keys 1–6 or click.'
    ],
    generate: matchingFigureLogic.generate,
    View: MatchingFigureView
  }),
  entry({
    id: 'spot-the-side',
    name: 'Spot the Side',
    category: 'spatial',
    shortDesc: "Left/right judgement from another person's perspective.",
    instructions: [
      'A person appears facing you (face and tie visible), with their back to you (no face), or standing sideways — the pose is also written under the figure. Higher difficulties add rotation.',
      'Facing you or away: one shape sits next to each hand — say in which of the PERSON’S OWN hands the asked shape is, not yours. When they face you, their right hand is on your left.',
      'Sideways: you see only ONE shape, held in the near hand — their right hand when they face right, their left when they face left. Use ← / → or click.'
    ],
    generate: spotSideLogic.generate,
    View: SpotTheSideView
  }),
  entry({
    id: 'cube-folding',
    name: 'Cube Folding',
    category: 'spatial',
    shortDesc: 'Pick the folded cube that matches an unfolded net.',
    instructions: [
      'An unfolded cube net is shown with six symbols; below are several folded cubes showing three faces each.',
      'Exactly one cube can be folded from the net. Watch out for mirror-image cubes and cubes showing faces that would be on opposite sides.',
      'Use number keys or click. Take your time — but the clock is running.'
    ],
    generate: cubeFoldingLogic.generate,
    View: CubeFoldingView
  }),
  entry({
    id: 'coordinate-system',
    name: 'Coordinate System',
    category: 'spatial',
    shortDesc: 'Estimate distances, headings and turns on a grid.',
    instructions: [
      'Two points, A and B, are plotted on a grid. North is up.',
      'Three question types rotate: the distance from A to B in grid units, the compass heading from A to B, and the turn (left/right + degrees) from a current course onto the course to B.',
      'Pick the best answer from the four options.'
    ],
    generate: coordinateSystemLogic.generate,
    View: CoordinateSystemView
  }),
  entry({
    id: 'planning',
    name: 'Landing Sequence',
    category: 'planning',
    shortDesc: 'Order aircraft for landing under a set of priority rules.',
    instructions: [
      'Several aircraft approach one runway. Each has a speed, a distance, and possibly a LOW FUEL warning.',
      'Apply the rules shown on the left, in priority order, to determine the correct landing sequence. Arrival time = distance ÷ speed.',
      'Click aircraft in landing order, then confirm. An unfinished sequence when the clock runs out counts as a miss.'
    ],
    extraLabels: { ruleViolations: 'Rule violations' },
    generate: planningLogic.generate,
    View: PlanningView
  }),
  entry({
    id: 'rule-application',
    name: 'Symbol Rules',
    category: 'memory',
    shortDesc: 'Apply a symbol→digit table that changes mid-run.',
    instructions: [
      'A table maps abstract symbols to digits. For each symbol shown, press its digit.',
      'The table CHANGES part-way through the run — a banner warns you. Adapt quickly; your post-change accuracy is measured separately.',
      'Answer with the digit keys or click.'
    ],
    extraLabels: { postChangeAccuracy: 'Accuracy after rule change' },
    generate: ruleApplicationLogic.generate,
    View: RuleApplicationView
  }),
  entry({
    id: 'memorize-instruments',
    name: 'Instrument Recall',
    category: 'memory',
    shortDesc: 'Memorize instrument readings shown for a few seconds.',
    instructions: [
      'A panel of instruments appears for a few seconds — a compass, thermometer, battery, clock, speed-limit sign and segmented gauge. Memorize every reading.',
      'The panel is then hidden and you are asked what a specific instrument read.',
      'Distractor options are neighbouring values on the same scale, so read each instrument precisely.'
    ],
    generate: memorizeInstrumentsLogic.generate,
    View: MemorizeInstrumentsView
  }),
  entry({
    id: 'memorize-pictograms',
    name: 'Pictogram Memory',
    category: 'memory',
    shortDesc: 'Remember abstract shapes through arithmetic interference.',
    instructions: [
      'One or more abstract pictograms appear — memorize them.',
      'You then solve simple arithmetic (this interference is deliberate), and finally must recognise each studied pictogram among very similar distractors.',
      'Both memory accuracy and arithmetic accuracy are reported.'
    ],
    extraLabels: { mathAccuracy: 'Math accuracy' },
    generate: memorizePictogramsLogic.generate,
    View: MemorizePictogramsView
  }),
  entry({
    id: 'english-listening',
    name: 'English Listening',
    category: 'english',
    shortDesc: 'Listen to short announcements; answer detail questions.',
    instructions: [
      'A short spoken announcement plays (gate changes, schedules, weather updates — everyday airport English, no ATC knowledge needed).',
      'Listen for the details: places, times, numbers, rooms and gates. At lower difficulty you may replay the passage once; from difficulty 3 it plays only once.',
      'Then answer the comprehension questions from memory. With audio off, the passage is shown as text instead.'
    ],
    generate: englishListeningLogic.generate,
    View: EnglishListeningView
  }),
  entry({
    id: 'radar-dart',
    name: 'Radar — Conflict Avoidance',
    category: 'simulation',
    shortDesc: 'Live radar: keep auto-routed traffic separated, hand off at exit fixes.',
    instructions: [
      'Aircraft cross your sector on their own routes (dashed line when selected) and normally reach their exit fix by themselves — but their routes CROSS, and same-level crossings lose separation (5 NM / 1000 ft).',
      'Click an aircraft, then vector it (turn buttons) or change its level (±1000 ft) to prevent conflicts. Press "Resume route" so it still leaves via its exit fix — an aircraft that drifts out of the sector anywhere else counts as a failed handoff.',
      'Red = separation lost now, amber = predicted within 60 s. Score: correct handoffs, conflicts, and time in conflict.'
    ],
    extraLabels: {
      conflicts: 'Separation losses',
      timeInConflictSec: 'Time in conflict (s)',
      unfinishedFlights: 'Still airborne at end'
    },
    generate: radarDartLogic.generate,
    View: RadarDartView
  }),
  entry({
    id: 'multipass',
    name: 'Multipass — Approach Control',
    category: 'simulation',
    shortDesc: 'Route arrivals to the right airport, work strips and audio at once.',
    instructions: [
      'THE CORE RULE: an aircraft only lands after you CLEAR it — click the aircraft (amber = uncleared), then press "Clear A" or "Clear B" matching the destination on its label (→A / →B). It then flies there by itself (dashed line) and lands. Uncleared aircraft never land: they fly straight on and are lost.',
      'Keep 4 NM lateral separation (all traffic is at one level) — use the 30° vector buttons for avoidance, then "Resume to cleared airport".',
      'Two side duties: when a flight nears its airport, its strip flashes REPORT — click that strip in time. And when a callsign is spoken, press M (or MATCH) ONLY if that callsign is currently on your scope.',
      'The event feed on the right confirms every landing, loss and report.'
    ],
    extraLabels: {
      conflicts: 'Separation losses',
      timeInConflictSec: 'Time in conflict (s)',
      unfinishedFlights: 'Lost arrivals',
      reportAccuracy: 'Strip reports acknowledged',
      audioAccuracy: 'Audio callsign accuracy',
      falseAlarms: 'False MATCH presses'
    },
    generate: multipassLogic.generate,
    View: MultipassView
  }),
  entry({
    id: 'radar-control',
    name: 'Radar Control — Gates',
    category: 'simulation',
    shortDesc: 'Vector every flight to its assigned exit gate, efficiently.',
    instructions: [
      'There is no autopilot here: aircraft hold whatever heading they have. Each is ASSIGNED an exit gate (on its label) — vector it there with turn commands and keep 5 NM / 1000 ft separation using level changes.',
      'Efficiency counts: the closer your flown path is to the straight line, the better your routing score.',
      'Radio checks name a callsign — press R (or ACK) ONLY when that callsign is one of yours.'
    ],
    extraLabels: {
      conflicts: 'Separation losses',
      timeInConflictSec: 'Time in conflict (s)',
      unfinishedFlights: 'Still airborne at end',
      routeEfficiency: 'Route efficiency',
      audioAccuracy: 'Radio check accuracy',
      falseAlarms: 'False ACK presses'
    },
    generate: radarControlLogic.generate,
    View: RadarControlView
  }),
  entry({
    id: 'strip-management',
    name: 'Strip Management',
    category: 'simulation',
    shortDesc: 'Detect conflicts from flight-strip data, not the radar picture.',
    instructions: [
      'Flight strips arrive at control-point columns, each showing a flight level (FL) and a live ETA countdown. Most strips are safe — only SOME form conflicts.',
      'Two strips CONFLICT when all three match: same COLUMN, same FL, and ETAs less than 3 minutes apart. Compare strips within each column, and when you spot such a pair, click ONE of its two strips.',
      'You get instant feedback: a correct click turns BOTH strips of the pair green (found, done); a wrong click flashes red and adds to your false counter — so do not click on suspicion alone.',
      'Watch for LEVEL UPDATES (amber highlight): a changed FL can create a brand-new conflict. Finding conflicts earlier gives a better time score.'
    ],
    extraLabels: { falseFlags: 'False flags' },
    generate: stripManagementLogic.generate,
    View: StripManagementView
  }),
  entry({
    id: 'big-numbers',
    name: 'Number Recall',
    category: 'memory',
    shortDesc: 'Hear a large number once; pick it from close options.',
    instructions: [
      'A sentence containing a large number is spoken once (or shown briefly when audio is off).',
      'Afterwards, choose the exact number from four very similar options — digit swaps are the usual trap.',
      'Numbers grow to 7 digits at higher difficulty.'
    ],
    generate: bigNumbersLogic.generate,
    View: BigNumbersView
  })
]

export const TASKS_BY_ID = new Map<TaskId, TaskEntry>(TASKS.map((t) => [t.id, t]))

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  attention: 'Attention & Multitasking',
  memory: 'Memory',
  spatial: 'Spatial & Orientation',
  planning: 'Planning',
  english: 'English',
  simulation: 'Simulations'
}

export type { TaskResult }
