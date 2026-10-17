import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { LanguageSync } from '@/i18n/LanguageSync'
import { SettingsProvider } from '@/shared/settings/SettingsProvider'

function App() {
  return (
    <SettingsProvider>
      <LanguageSync />
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </SettingsProvider>
  )
}

export default App
