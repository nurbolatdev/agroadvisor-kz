import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/ui/PageHeader'
import { AiModelCard } from '@/features/settings/components/AiModelCard'
import { InterfaceCard } from '@/features/settings/components/InterfaceCard'
import { NotificationsCard } from '@/features/settings/components/NotificationsCard'
import { ProfileCard } from '@/features/settings/components/ProfileCard'
import { SaveBar } from '@/features/settings/components/SaveBar'
import { useSettingsDraft } from '@/features/settings/useSettingsDraft'
import { isValidThreshold, THRESHOLD_RANGE } from '@/shared/settings/settings'

const SAVED_MESSAGE_MS = 2500

export function SettingsPage() {
  const { t } = useTranslation('settings')
  const { draft, isDirty, change, save, discard } = useSettingsDraft()
  const [savedAt, setSavedAt] = useState<number>()
  // The threshold field keeps raw text while typing; the draft gets the number.
  const [thresholdText, setThresholdText] = useState<string>()
  const nameError = draft.profileName.trim() ? undefined : t('profile.nameRequired')
  const shownThreshold = thresholdText ?? String(draft.confidenceThreshold)
  const thresholdError = isValidThreshold(Number(shownThreshold))
    ? undefined
    : t('aiModel.thresholdError', THRESHOLD_RANGE)

  useEffect(() => {
    if (!savedAt) return
    const timer = window.setTimeout(() => setSavedAt(undefined), SAVED_MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [savedAt])

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
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
        <AiModelCard
          value={shownThreshold}
          error={thresholdError}
          onChange={(text) => {
            setThresholdText(text)
            if (isValidThreshold(Number(text))) change('confidenceThreshold', Number(text))
          }}
        />
        <NotificationsCard
          value={draft.notifications}
          onChange={(notifications) => change('notifications', notifications)}
        />
      </div>
      <SaveBar
        isDirty={isDirty || shownThreshold !== String(draft.confidenceThreshold)}
        justSaved={savedAt !== undefined}
        canSave={!nameError && !thresholdError}
        onSave={() => {
          save()
          setThresholdText(undefined)
          setSavedAt(Date.now())
        }}
        onDiscard={() => {
          discard()
          setThresholdText(undefined)
        }}
      />
    </>
  )
}
