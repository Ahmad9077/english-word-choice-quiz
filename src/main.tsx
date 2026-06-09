import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    QuizzesHubAccessReady?: Promise<{ difficulty?: string }>
  }
}

type Difficulty = 'easy' | 'medium' | 'hard'

const normalizeDifficulty = (value: string | undefined): Difficulty => {
  if (value === 'easy' || value === 'hard') return value

  return 'medium'
}

async function renderApp() {
  try {
    if (!window.QuizzesHubAccessReady) {
      throw new Error('Missing Quizzes Hub access guard.')
    }

    const access = await window.QuizzesHubAccessReady
    const difficulty = normalizeDifficulty(access.difficulty)

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App initialLevel={difficulty} />
      </StrictMode>,
    )
  } catch {
    document.documentElement.dataset.quizAccess = 'denied'
    document.getElementById('root')!.textContent = 'Please open this quiz from Quizzes Hub.'
  }
}

void renderApp()
