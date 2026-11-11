import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { api } from '@/services/api'
import { ApiError, NetworkError } from '@/services/http'
import type { Agrochemist } from '@/shared/types'
import { notifyDataChanged } from '@/shared/utils/dataEvents'

type Decision = 'approve' | 'reject' | 'request'

/** Runs approve / reject / request-documents calls and tracks which row is busy. */
export function useVerificationDecisions(onChanged: () => void) {
  const { t } = useTranslation('agrochemists')
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()

  // The backend codes are translated; the mock throws plain messages, which are shown as they are.
  const decisionErrorText = (cause: unknown): string => {
    if (cause instanceof NetworkError) return t('decision.errors.network')
    if (cause instanceof ApiError) {
      const key = `decision.errors.${cause.code}`
      return i18n.exists(`agrochemists:${key}`) ? t(key as never) : t('decision.saveError')
    }
    return cause instanceof Error ? cause.message : t('decision.saveError')
  }

  const run = async (agrochemist: Agrochemist, decision: Decision, reason = '') => {
    setBusyId(agrochemist.id)
    setError(undefined)
    try {
      if (decision === 'approve') await api.approveAgrochemist(agrochemist.id)
      if (decision === 'reject') await api.rejectAgrochemist(agrochemist.id, reason)
      if (decision === 'request') await api.requestDocuments(agrochemist.id)
      onChanged()
      notifyDataChanged()
      return true
    } catch (reasonError) {
      setError(decisionErrorText(reasonError))
      return false
    } finally {
      setBusyId(undefined)
    }
  }

  return {
    busyId,
    error,
    approve: (agrochemist: Agrochemist) => run(agrochemist, 'approve'),
    reject: (agrochemist: Agrochemist, reason: string) => run(agrochemist, 'reject', reason),
    requestDocuments: (agrochemist: Agrochemist) => run(agrochemist, 'request'),
  }
}
