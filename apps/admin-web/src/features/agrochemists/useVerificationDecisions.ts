import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/services/api'
import type { Agrochemist } from '@/shared/types'
import { notifyDataChanged } from '@/shared/utils/dataEvents'

type Decision = 'approve' | 'reject' | 'request'

/** Runs approve / reject / request-documents calls and tracks which row is busy. */
export function useVerificationDecisions(onChanged: () => void) {
  const { t } = useTranslation('agrochemists')
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()

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
      setError(reasonError instanceof Error ? reasonError.message : t('decision.saveError'))
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
