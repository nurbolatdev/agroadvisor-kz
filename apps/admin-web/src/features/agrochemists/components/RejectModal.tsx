import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { Agrochemist } from '@/shared/types'

const REJECTION_REASONS = ['noDiploma', 'unreadable', 'mismatch', 'noExperience'] as const

type RejectionReason = (typeof REJECTION_REASONS)[number]

interface RejectModalProps {
  agrochemist: Agrochemist | undefined
  onClose: () => void
  /** The reason text in the admin's language; it is saved with the application. */
  onConfirm: (reason: string) => void
}

export function RejectModal({ agrochemist, onClose, onConfirm }: RejectModalProps) {
  const { t } = useTranslation(['agrochemists', 'common'])
  const [reason, setReason] = useState<RejectionReason>(REJECTION_REASONS[0])
  const reasonText = t(`rejectModal.reasons.${reason}`)

  return (
    <Modal
      open={agrochemist !== undefined}
      onClose={onClose}
      title={t('rejectModal.title', { name: agrochemist?.name ?? '' })}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" variant="danger" icon={X} onClick={() => onConfirm(reasonText)}>
            {t('common:actions.reject')}
          </Button>
        </>
      }
    >
      <p className="mb-4">{t('rejectModal.note')}</p>
      <Select
        label={t('rejectModal.reasonLabel')}
        value={reason}
        onChange={(event) => setReason(event.target.value as RejectionReason)}
        options={REJECTION_REASONS.map((value) => ({
          value,
          label: t(`rejectModal.reasons.${value}`),
        }))}
      />
    </Modal>
  )
}
