import { glyphKey, mutateGlyph, randomGlyph, type Glyph } from '@shared/glyphs'
import { Rng } from '@shared/rng'
import { buildResult } from '@shared/scoring'
import type {
  Difficulty,
  ItemOutcome,
  ItemResponse,
  ScenarioBase,
  TaskLogic,
  TaskResult
} from '@shared/types'

/**
 * Memorize Pictograms — abstract-shape memory with arithmetic interference.
 * Study a small set of pictograms, solve simple arithmetic, then recognise
 * each studied pictogram among near-miss distractors.
 */
export interface MathQuestion {
  prompt: string
  options: string[]
  correctIndex: number
  timeLimitMs: number
}

export interface RecognitionRound {
  options: Glyph[]
  correctIndex: number
  timeLimitMs: number
}

export interface PictogramItem {
  studySet: Glyph[]
  exposureMs: number
  mathQuestions: MathQuestion[]
  recognitionRounds: RecognitionRound[]
}

export interface PictogramScenario extends ScenarioBase {
  taskId: 'memorize-pictograms'
  items: PictogramItem[]
}

/** Responses arrive flattened across items, split by sub-stream. */
export interface PictogramResponses {
  math: ItemResponse[]
  recognition: ItemResponse[]
}

interface Config {
  items: number
  studySize: number
  glyphSize: number
  glyphFill: number
  exposureMs: number
  mathQuestions: number
  mathTimeLimitMs: number
  recognitionTimeLimitMs: number
}

const CONFIG: Record<Difficulty, Config> = {
  1: { items: 4, studySize: 1, glyphSize: 4, glyphFill: 6, exposureMs: 3500, mathQuestions: 2, mathTimeLimitMs: 10000, recognitionTimeLimitMs: 9000 },
  2: { items: 4, studySize: 2, glyphSize: 4, glyphFill: 6, exposureMs: 5000, mathQuestions: 2, mathTimeLimitMs: 9000, recognitionTimeLimitMs: 8000 },
  3: { items: 4, studySize: 2, glyphSize: 5, glyphFill: 9, exposureMs: 4500, mathQuestions: 3, mathTimeLimitMs: 8000, recognitionTimeLimitMs: 8000 },
  4: { items: 5, studySize: 3, glyphSize: 5, glyphFill: 9, exposureMs: 6000, mathQuestions: 3, mathTimeLimitMs: 8000, recognitionTimeLimitMs: 7000 },
  5: { items: 5, studySize: 4, glyphSize: 5, glyphFill: 10, exposureMs: 7000, mathQuestions: 4, mathTimeLimitMs: 7000, recognitionTimeLimitMs: 6000 }
}

function makeMathQuestion(rng: Rng, timeLimitMs: number): MathQuestion {
  const a = rng.int(11, 89)
  const b = rng.int(11, 89)
  const add = rng.bool()
  const [x, y] = add || a >= b ? [a, b] : [b, a]
  const answer = add ? x + y : x - y
  const prompt = `${x} ${add ? '+' : '−'} ${y} = ?`
  const values = new Set<number>([answer])
  let guard = 0
  while (values.size < 4 && ++guard < 100) {
    const v = answer + rng.int(1, 10) * (rng.bool() ? 1 : -1)
    if (v >= 0) values.add(v)
  }
  let pad = 11
  while (values.size < 4) values.add(answer + pad++)
  const options = rng.shuffle([...values].map(String))
  return { prompt, options, correctIndex: options.indexOf(String(answer)), timeLimitMs }
}

function distinctStudySet(rng: Rng, cfg: Config): Glyph[] {
  const set: Glyph[] = []
  const used = new Set<string>()
  let guard = 0
  while (set.length < cfg.studySize) {
    if (++guard > 500) throw new Error('memorize-pictograms: could not build study set')
    const g = randomGlyph(rng, cfg.glyphSize, cfg.glyphFill)
    const key = glyphKey(g)
    if (used.has(key)) continue
    used.add(key)
    set.push(g)
  }
  return set
}

function makeRecognitionRound(
  rng: Rng,
  studySet: Glyph[],
  targetIndex: number,
  timeLimitMs: number
): RecognitionRound {
  const target = studySet[targetIndex]
  const studyKeys = new Set(studySet.map(glyphKey))
  const used = new Set<string>([glyphKey(target)])
  const distractors: Glyph[] = []
  let guard = 0
  while (distractors.length < 3) {
    if (++guard > 500) throw new Error('memorize-pictograms: could not build distractors')
    const d = mutateGlyph(rng, target, rng.int(1, 2))
    const key = glyphKey(d)
    // distractors must not equal the target OR any other studied glyph
    if (used.has(key) || studyKeys.has(key)) continue
    used.add(key)
    distractors.push(d)
  }
  const options = rng.shuffle([target, ...distractors])
  return {
    options,
    correctIndex: options.findIndex((o) => glyphKey(o) === glyphKey(target)),
    timeLimitMs
  }
}

export function generate(seed: string, difficulty: Difficulty): PictogramScenario {
  const rng = new Rng(`memorize-pictograms:${seed}:${difficulty}`)
  const cfg = CONFIG[difficulty]
  const items: PictogramItem[] = []
  for (let i = 0; i < cfg.items; i++) {
    const studySet = distinctStudySet(rng, cfg)
    const order = rng.shuffle(Array.from({ length: studySet.length }, (_, k) => k))
    items.push({
      studySet,
      exposureMs: cfg.exposureMs,
      mathQuestions: Array.from({ length: cfg.mathQuestions }, () =>
        makeMathQuestion(rng, cfg.mathTimeLimitMs)
      ),
      recognitionRounds: order.map((targetIndex) =>
        makeRecognitionRound(rng, studySet, targetIndex, cfg.recognitionTimeLimitMs)
      )
    })
  }
  return { taskId: 'memorize-pictograms', seed, difficulty, items }
}

/** Primary score = recognition accuracy; math accuracy reported as extra. */
export function score(scenario: PictogramScenario, responses: PictogramResponses): TaskResult {
  const recCorrect = scenario.items.flatMap((i) => i.recognitionRounds.map((r) => r.correctIndex))
  const items: ItemOutcome[] = recCorrect.map((correctIndex, index) => {
    const r = responses.recognition[index]
    if (!r || r.answerIndex === null) {
      return { index, correct: false, rtMs: r?.rtMs ?? 0, timedOut: true }
    }
    return { index, correct: r.answerIndex === correctIndex, rtMs: r.rtMs, timedOut: false }
  })

  const mathCorrect = scenario.items.flatMap((i) => i.mathQuestions.map((q) => q.correctIndex))
  let mathOk = 0
  mathCorrect.forEach((correctIndex, index) => {
    if (responses.math[index]?.answerIndex === correctIndex) mathOk++
  })

  return buildResult(scenario.taskId, items, {
    mathAccuracy: mathCorrect.length === 0 ? 0 : mathOk / mathCorrect.length
  })
}

export const memorizePictogramsLogic: TaskLogic<PictogramScenario, PictogramResponses> = {
  taskId: 'memorize-pictograms',
  generate,
  score
}
