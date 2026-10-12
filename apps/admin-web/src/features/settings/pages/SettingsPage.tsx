import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { InterfaceCard } from '@/features/settings/components/InterfaceCard'
import { ProfileCard } from '@/features/settings/components/ProfileCard'
import { SaveBar } from '@/features/settings/components/SaveBar'
import { useSettingsDraft } from '@/features/settings/useSettingsDraft'

const SAVED_MESSAGE_MS = 2500

export function SettingsPage() {
  const { draft, isDirty, change, save, discard } = useSettingsDraft()
  const [savedAt, setSavedAt] = useState<number>()
  const nameError = draft.profileName.trim() ? undefined : 'Укажите имя'

  useEffect(() => {
    if (!savedAt) return
    const timer = window.setTimeout(() => setSavedAt(undefined), SAVED_MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [savedAt])

  return (
    <>
      <PageHeader title="Настройки" subtitle="Профиль и параметры админ-панели" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ProfileCard
          name={draft.profileName}
          onNameChange={(name) => change('profileName', name)}
          error={nameError}
        />
        <InterfaceCard
          language={draft.language}
          defaultPeriod={draft.defaultPeriod}
          onLanguageChange={(language) => change('language', language)}
          onPeriodChange={(period) => change('defaultPeriod', period)}
        />
      </div>
      <SaveBar
        isDirty={isDirty}
        justSaved={savedAt !== undefined}
        canSave={!nameError}
        onSave={() => {
          save()
          setSavedAt(Date.now())
        }}
        onDiscard={discard}
      />
    </>
  )
}
