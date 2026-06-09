import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Star,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react'
import './App.css'
import { wordBank, type WordEntry, type Tier } from './data/wordBank'

interface HubDetail {
  key: string
  word: string
  clue: string
  tier: Tier
  selected: string
  expected: string
  correct: boolean
}

interface HubProgressPayload {
  quizId: string
  score: number
  total: number
  level?: string
  details?: Record<string, unknown>
}

interface HubAttemptItem {
  question: { key: string }
  correct: boolean
}

interface HubResult {
  ok: boolean
  reason?: string
}

declare global {
  interface Window {
    QuizzesHubProgress?: {
      record: (payload: HubProgressPayload) => Promise<HubResult> | undefined
    }
    QuizzesHubAdaptive?: {
      recordAttempt: (attempts: HubAttemptItem[]) => Promise<HubResult> | undefined
    }
    QuizzesHubAdaptiveReady?: Promise<{ question_keys?: string[] } | undefined>
  }
}

const QUIZ_ID = 'english-word-choice'
const QUESTIONS_PER_ROUND = 15
const ADAPTIVE_READY_TIMEOUT_MS = 1200

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildChoices(entry: WordEntry): string[] {
  const distractors = shuffle(entry.distractors.filter((distractor) => distractor !== entry.word)).slice(0, 3)
  return shuffle([entry.word, ...distractors])
}

function scoreMessage(score: number, total: number): string {
  const ratio = score / total
  if (ratio === 1) return 'Perfect! Outstanding!'
  if (ratio >= 0.8) return 'Brilliant work!'
  if (ratio >= 0.6) return 'Good job!'
  return 'Keep practicing!'
}

async function reportToHub(
  details: HubDetail[],
  level: Tier | 'mixed',
) {
  const score = details.filter(d => d.correct).length
  const attempts: HubAttemptItem[] = details.map(d => ({
    question: { key: d.key },
    correct: d.correct,
  }))

  let adaptiveOk = false
  if (window.QuizzesHubAdaptive) {
    try {
      const res = await window.QuizzesHubAdaptive.recordAttempt(attempts)
      if (res && res.ok) adaptiveOk = true
    } catch {
      // fall through to progress record
    }
  }

  if (!adaptiveOk && window.QuizzesHubProgress) {
    try {
      await window.QuizzesHubProgress.record({
        quizId: QUIZ_ID,
        score,
        total: QUESTIONS_PER_ROUND,
        level: score === QUESTIONS_PER_ROUND ? 'A+' : score >= 12 ? 'A' : score >= 9 ? 'Practice' : 'Review',
        details: { selectedLevel: level, answers: details },
      })
    } catch {
      // best effort
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), timeoutMs)

    promise
      .then((value) => resolve(value))
      .catch(() => resolve(null))
      .finally(() => window.clearTimeout(timeout))
  })
}

async function pickQuestions(level: Tier | 'mixed'): Promise<WordEntry[]> {
  let preferredKeys: string[] = []

  if (window.QuizzesHubAdaptiveReady) {
    const res = await withTimeout(window.QuizzesHubAdaptiveReady, ADAPTIVE_READY_TIMEOUT_MS)
    if (res?.question_keys) preferredKeys = res.question_keys
  }

  const pool =
    level === 'mixed'
      ? wordBank
      : wordBank.filter(e => e.tier === level)

  const keySet = new Set(pool.map(e => e.key))

  const matched = preferredKeys
    .filter(k => keySet.has(k))
    .map(k => pool.find(e => e.key === k)!)
    .filter(Boolean)

  const usedKeys = new Set(matched.map(e => e.key))
  const remaining = shuffle(pool.filter(e => !usedKeys.has(e.key)))

  return [...matched, ...remaining].slice(0, QUESTIONS_PER_ROUND)
}

type Screen = 'start' | 'quiz' | 'results'

interface QuestionState {
  entry: WordEntry
  choices: string[]
  selected: string | null
  locked: boolean
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [level, setLevel] = useState<Tier | 'mixed'>('mixed')
  const [questions, setQuestions] = useState<QuestionState[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [details, setDetails] = useState<HubDetail[]>([])
  const [speaking, setSpeaking] = useState(false)

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)

  const current = questions[qIndex] as QuestionState | undefined

  useEffect(() => {
    return () => window.speechSynthesis?.cancel()
  }, [])

  const speakWord = useCallback((word: string) => {
    window.speechSynthesis?.cancel()
    const utt = new SpeechSynthesisUtterance(word)
    utt.rate = 0.85
    utt.pitch = 1
    utt.lang = 'en-GB'
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    speechRef.current = utt
    window.speechSynthesis?.speak(utt)
  }, [])

  const handleStart = useCallback(async () => {
    const qs = await pickQuestions(level)
    setQuestions(qs.map(entry => ({
      entry,
      choices: buildChoices(entry),
      selected: null,
      locked: false,
    })))
    setQIndex(0)
    setDetails([])
    setScreen('quiz')
  }, [level])

  const handleChoice = useCallback((choice: string) => {
    if (!current || current.locked) return

    const correct = choice === current.entry.word

    const detail: HubDetail = {
      key: current.entry.key,
      word: current.entry.word,
      clue: current.entry.clue,
      tier: current.entry.tier,
      selected: choice,
      expected: current.entry.word,
      correct,
    }

    setDetails(prev => [...prev, detail])
    setQuestions(prev =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, selected: choice, locked: true }
          : q
      )
    )
  }, [current, qIndex])

  const handleNext = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    if (qIndex + 1 >= QUESTIONS_PER_ROUND) {
      setScreen('results')
      void reportToHub(details, level)
    } else {
      setQIndex(i => i + 1)
    }
  }, [qIndex, details, level])

  const handleRestart = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setScreen('start')
  }, [])

  if (screen === 'start') {
    return (
      <div className="quiz-shell">
        <StartScreen
          level={level}
          onLevelChange={setLevel}
          onStart={handleStart}
        />
      </div>
    )
  }

  if (screen === 'quiz' && current) {
    return (
      <div className="quiz-shell">
        <QuizView
          question={current}
          qIndex={qIndex}
          total={QUESTIONS_PER_ROUND}
          speaking={speaking}
          onSpeak={() => speakWord(current.entry.word)}
          onChoice={handleChoice}
          onNext={handleNext}
        />
      </div>
    )
  }

  if (screen === 'results') {
    const score = details.filter(d => d.correct).length
    return (
      <div className="quiz-shell">
        <ResultsScreen
          details={details}
          score={score}
          total={QUESTIONS_PER_ROUND}
          level={level}
          onRestart={handleRestart}
          onPlayAgain={handleStart}
        />
      </div>
    )
  }

  return null
}

interface StartScreenProps {
  level: Tier | 'mixed'
  onLevelChange: (l: Tier | 'mixed') => void
  onStart: () => void
}

function StartScreen({ level, onLevelChange, onStart }: StartScreenProps) {
  return (
    <div className="start-screen">
      <img
        alt=""
        className="study-visual"
        src={`${import.meta.env.BASE_URL}word-choice-study.png`}
      />
      <BookOpen className="start-icon" size={44} strokeWidth={1.5} />
      <h1>English Word Choice</h1>
      <p>Listen to the word, read the clue, then choose the correct spelling.</p>

      <div className="level-select">
        <label htmlFor="level-select">Choose a level</label>
        <select
          id="level-select"
          value={level}
          onChange={e => onLevelChange(e.target.value as Tier | 'mixed')}
        >
          <option value="mixed">Mixed (All levels)</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <button className="btn-primary" onClick={onStart}>
        <Star size={18} />
        Start Quiz
      </button>
    </div>
  )
}

interface QuizViewProps {
  question: QuestionState
  qIndex: number
  total: number
  speaking: boolean
  onSpeak: () => void
  onChoice: (choice: string) => void
  onNext: () => void
}

function QuizView({
  question, qIndex, total, speaking, onSpeak, onChoice, onNext
}: QuizViewProps) {
  const { entry, choices, selected, locked } = question
  const isCorrect = selected === entry.word

  const choiceClass = (c: string): string => {
    if (!locked) return ''
    if (c === selected && isCorrect) return 'locked-correct'
    if (c === selected && !isCorrect) return 'locked-wrong'
    if (locked && !isCorrect && c === entry.word) return 'reveal-correct'
    return ''
  }

  return (
    <div className="quiz-view">
      <div className="quiz-header">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${((qIndex + (locked ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
        <span className="q-counter">{qIndex + 1} / {total}</span>
        <span className={`tier-badge ${entry.tier}`}>{entry.tier}</span>
      </div>

      <div className="clue-card">
        <p>{entry.clue}</p>
        <button
          className={`speak-btn${speaking ? ' speaking' : ''}`}
          onClick={onSpeak}
          aria-label="Hear the word"
        >
          <Volume2 size={16} />
          {speaking ? 'Listening...' : 'Hear word'}
        </button>
      </div>

      <div className="choices">
        {choices.map(c => (
          <button
            key={c}
            className={`choice-btn ${choiceClass(c)}`}
            onClick={() => onChoice(c)}
            disabled={locked}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="feedback-row">
        {locked && (
          <div className={`feedback-msg ${isCorrect ? 'correct' : 'wrong'}`}>
            {isCorrect
              ? <><CheckCircle2 size={20} /> Correct!</>
              : <><XCircle size={20} /> The answer is <em>"{entry.word}"</em></>
            }
          </div>
        )}
        {locked && (
          <button className="next-btn" onClick={onNext}>
            {qIndex + 1 < total ? 'Next' : 'Results'}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

interface ResultsScreenProps {
  details: HubDetail[]
  score: number
  total: number
  level: Tier | 'mixed'
  onRestart: () => void
  onPlayAgain: () => void
}

function ResultsScreen({
  details, score, total, onRestart, onPlayAgain
}: ResultsScreenProps) {
  return (
    <div className="results-screen">
      <div className="results-hero">
        <Trophy className="results-icon" size={42} strokeWidth={1.8} />
        <h2>{scoreMessage(score, total)}</h2>
        <div className="score-fraction">
          {score}<span>/{total}</span>
        </div>
        <p className="score-sub">questions answered correctly</p>
      </div>

      <p className="review-header">Review your answers</p>

      <div className="review-list">
        {details.map((d, i) => (
          <div
            key={`${d.key}-${i}`}
            className={`review-item ${d.correct ? 'correct-item' : 'wrong-item'}`}
          >
            <span className={`review-icon ${d.correct ? 'correct' : 'wrong'}`}>
              {d.correct
                ? <CheckCircle2 size={20} />
                : <XCircle size={20} />
              }
            </span>
            <div className="review-body">
              <div className="review-word">{d.word}</div>
              <div className="review-clue">{d.clue}</div>
              {!d.correct && (
                <div className="review-selected">
                  <span className="selected-label">You chose: </span>
                  <span className="selected-val">{d.selected}</span>
                </div>
              )}
            </div>
            <span className={`tier-badge ${d.tier}`}>{d.tier}</span>
          </div>
        ))}
      </div>

      <div className="results-actions">
        <button className="btn-primary" onClick={onPlayAgain}>
          <Trophy size={18} />
          Play Again (same level)
        </button>
        <button className="btn-secondary" onClick={onRestart}>
          <RotateCcw size={16} />
          Change Level
        </button>
      </div>
    </div>
  )
}
