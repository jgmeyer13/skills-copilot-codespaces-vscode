import { useState } from 'react'
import { CATEGORIES, STUDY_DECK, QUIZ_BANK } from './data'

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildSession(bank) {
  return shuffle(bank).map((q) => ({
    ...q,
    options: shuffle([q.correct, ...q.distractors]),
  }))
}

function Header({ mode, setMode }) {
  return (
    <header className="fb-header">
      <h1 className="fb-title">Fat Butcher</h1>
      <div className="fb-rule" />
      <div className="fb-subtitle">Test Prep</div>
      <div className="fb-mode-toggle" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'study'}
          className={`fb-tab ${mode === 'study' ? 'active' : ''}`}
          onClick={() => setMode('study')}
        >
          Study
        </button>
        <button
          role="tab"
          aria-selected={mode === 'quiz'}
          className={`fb-tab ${mode === 'quiz' ? 'active' : ''}`}
          onClick={() => setMode('quiz')}
        >
          Quiz
        </button>
      </div>
    </header>
  )
}

function StudyMode() {
  const [category, setCategory] = useState(CATEGORIES[0])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const cards = STUDY_DECK[category]
  const card = cards[index]

  const go = (delta) => {
    setIndex((i) => {
      const next = i + delta
      if (next < 0) return cards.length - 1
      if (next >= cards.length) return 0
      return next
    })
    setFlipped(false)
  }

  const selectCategory = (c) => {
    setCategory(c)
    setIndex(0)
    setFlipped(false)
  }

  return (
    <div className="fb-study">
      <div className="fb-cat-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`fb-cat-tab ${c === category ? 'active' : ''}`}
            onClick={() => selectCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="fb-progress">
        Card {index + 1} of {cards.length}
      </div>

      <div
        className={`fb-card ${flipped ? 'flipped' : ''}`}
        onClick={() => setFlipped((f) => !f)}
        role="button"
        aria-pressed={flipped}
      >
        <div className="fb-card-inner">
          <div className="fb-card-face">
            <div className="fb-card-corner">{category}</div>
            <div className="fb-card-q">{card.q}</div>
            <div className="fb-card-hint">Tap to reveal</div>
          </div>
          <div className="fb-card-face fb-card-back">
            <div className="fb-card-corner">Answer</div>
            <div className="fb-card-a">{card.a}</div>
            <div className="fb-card-hint">Tap to flip back</div>
          </div>
        </div>
      </div>

      <div className="fb-nav">
        <button onClick={() => go(-1)}>← Prev</button>
        <button onClick={() => go(1)}>Next →</button>
      </div>
      <button className="fb-flip-btn" onClick={() => setFlipped((f) => !f)}>
        {flipped ? 'Hide answer' : 'Reveal answer'}
      </button>
    </div>
  )
}

function QuizMode() {
  const [questions, setQuestions] = useState(() => buildSession(QUIZ_BANK))
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [missed, setMissed] = useState([])
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)

  const q = questions[idx]

  const pick = (opt) => {
    if (selected !== null) return
    setSelected(opt)
    if (opt === q.correct) {
      setScore((s) => s + 1)
    } else {
      setMissed((m) => [...m, { category: q.category, q: q.q, correct: q.correct, distractors: q.distractors }])
    }
  }

  const next = () => {
    if (idx + 1 >= questions.length) {
      setDone(true)
    } else {
      setIdx((i) => i + 1)
      setSelected(null)
    }
  }

  const retryMissed = () => {
    if (missed.length === 0) return
    setQuestions(buildSession(missed))
    setIdx(0)
    setScore(0)
    setMissed([])
    setSelected(null)
    setDone(false)
  }

  const restart = () => {
    setQuestions(buildSession(QUIZ_BANK))
    setIdx(0)
    setScore(0)
    setMissed([])
    setSelected(null)
    setDone(false)
  }

  if (done) {
    return (
      <div className="fb-quiz-end">
        <h2 className="fb-end-title">Service Done</h2>
        <div className="fb-end-rule" />
        <div className="fb-score-big">
          {score}<span style={{ color: 'var(--text-dim)' }}>/</span>{questions.length}
        </div>
        <div className="fb-score-label">Correct</div>

        {missed.length > 0 ? (
          <>
            <div className="fb-missed-title">Missed — Review</div>
            <ul className="fb-missed">
              {missed.map((m, i) => (
                <li key={i}>
                  <div className="fb-missed-q">{m.q}</div>
                  <div className="fb-missed-a">→ {m.correct}</div>
                  <div className="fb-missed-cat">{m.category}</div>
                </li>
              ))}
            </ul>
            <button className="fb-btn-primary" onClick={retryMissed}>
              Retry Missed ({missed.length})
            </button>
            <button className="fb-btn-secondary" onClick={restart}>
              Restart Full Quiz
            </button>
          </>
        ) : (
          <>
            <p className="fb-perfect">Clean sweep. Cab Sav on the house.</p>
            <button className="fb-btn-primary" onClick={restart}>
              Play Again
            </button>
          </>
        )}
      </div>
    )
  }

  const isAnswered = selected !== null
  const wasRight = isAnswered && selected === q.correct

  return (
    <div className="fb-quiz">
      <div className="fb-quiz-meta">
        <span>Q {idx + 1} / {questions.length}</span>
        <span className="score">Score {score}</span>
      </div>
      <div className="fb-quiz-cat">{q.category}</div>
      <div className="fb-quiz-q">{q.q}</div>
      <div className="fb-quiz-options">
        {q.options.map((o, i) => {
          let cls = 'fb-quiz-opt'
          if (isAnswered) {
            if (o === q.correct) cls += ' correct'
            else if (o === selected) cls += ' wrong'
            else cls += ' faded'
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => pick(o)}
              disabled={isAnswered}
            >
              {o}
            </button>
          )
        })}
      </div>
      {isAnswered && (
        <>
          <div className={`fb-feedback ${wasRight ? 'right' : 'wrong'}`}>
            {wasRight ? '✓ Sharp.' : '✗ Not quite.'}
          </div>
          <button className="fb-btn-primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
          </button>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState('study')
  return (
    <div className="fb-app">
      <Header mode={mode} setMode={setMode} />
      {mode === 'study' ? <StudyMode /> : <QuizMode />}
      <footer className="fb-footer">Cab Sav + Steak · The Perfect Pair</footer>
    </div>
  )
}
