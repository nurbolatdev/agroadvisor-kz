import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import '@/i18n'
import App from '@/app/App.tsx'
import { session } from '@/services/backend'
import { API_MODE } from '@/services/config'

// Read the saved session once, before the first render decides between the pages and the sign-in.
if (API_MODE === 'live') void session.restore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
