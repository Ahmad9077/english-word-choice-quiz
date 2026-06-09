# English Word Choice Quiz

A React + TypeScript + Vite static quiz app for an English Word Choice Quiz, targeting strong 8-year-olds.

## Features

- 15 questions per round drawn from a 500+ word bank
- Words spoken aloud using the Web Speech API (SpeechSynthesis)
- Four multiple-choice spelling options (correct + 3 near-miss distractors)
- Difficulty levels: Easy, Medium, Hard, or Mixed
- Immediate correct/wrong feedback; correct answer revealed on miss
- Results screen with full answer review and restart options
- Lucide-react icons, mobile-first single-viewport layout
- Quiz hub manifest at `public/quiz-manifest.json`

## Hub Integration

The app integrates with `window.QuizzesHubAdaptive` and `window.QuizzesHubProgress`:

- **`window.QuizzesHubAccessReady`** - required before the React app renders. The quiz must be opened by an assigned Quizzes Hub user.
- **`window.QuizzesHubAdaptiveReady`** - awaited briefly at quiz start; `question_keys` from the hub are honored first when matched against the word bank, then the round is filled with shuffled bank entries.
- **`window.QuizzesHubAdaptive.recordAttempt(attempts)`** - called at quiz end with per-question `{ question: { key }, correct }` items. Used in preference.
- **`window.QuizzesHubProgress.record(payload)`** - fallback when adaptive record is absent or returns non-ok. Payload includes `quizId`, `score`, `total`, `level`, and detailed `details[]`.

`details[]` items include: `key`, `word`, `clue`, `tier`, `selected`, `expected`, `correct`.

The page loads Quizzes Hub scripts in this order: `config.js`, `access-guard.js`, `progress-client.js`, `adaptive-client.js`, then the Vite module.

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint with ESLint |
| `npm run preview` | Preview the production build |

## Deploy

The Vite base path is `/english-word-choice-quiz/`. Pushes to `main` deploy through `.github/workflows/deploy.yml` using GitHub Pages.
