import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { API_URL } from '@/api/config'
import type { DiagnosisResult } from '@/api/diagnosis'
import { isCrop } from '@/features/diagnosis/crops'
import { useDiagnosis, useSession } from '@/services'
import { useSettings } from '@/store/settings'

import { formatDiagnosisDate } from './dates'
import { describeRow } from './describeRow'
import { DiagnosisListItem } from './DiagnosisListItem'
import { toHistoryRow } from './historyRow'
import { photoSource } from './photoSource'

type Props = {
  diagnosis: DiagnosisResult
  // disease names by class code (useDiseaseNames); empty until the reference is loaded
  names: Record<string, string>
}

// One earlier diagnosis, as the History tab and the home screen list it. A tap opens the result screen:
// that screen reads diagnoses from the store, so the one from the server is put there first.
export function HistoryLine({ diagnosis, names }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const language = useSettings((s) => s.language)
  const accessToken = useSession((s) => s.accessToken)

  const row = toHistoryRow(diagnosis)
  const view = describeRow(row, {
    cropName: (code) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code),
    diseaseName: (code) => names[code],
    statusLabel: (variant) => t(`history.status.${variant}`),
    date: formatDiagnosisDate(row.createdAt, language),
  })

  return (
    <DiagnosisListItem
      title={view.title}
      subtitle={view.subtitle}
      badge={view.badge}
      photo={photoSource(row.photoUrl, API_URL, accessToken)}
      onPress={() => {
        useDiagnosis.getState().rememberResult(diagnosis)
        router.push(`/diagnosis/result/${diagnosis.id}`)
      }}
    />
  )
}
