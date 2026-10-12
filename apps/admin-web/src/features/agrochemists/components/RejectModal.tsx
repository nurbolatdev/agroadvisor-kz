import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { Agrochemist } from '@/shared/types'

const REJECTION_REASONS = [
  'Нет диплома о профильном образовании',
  'Документы нечитаемы или неполные',
  'Данные в документах не совпадают с профилем',
  'Недостаточный опыт работы',
]

interface RejectModalProps {
  agrochemist: Agrochemist | undefined
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function RejectModal({ agrochemist, onClose, onConfirm }: RejectModalProps) {
  const [reason, setReason] = useState(REJECTION_REASONS[0])

  return (
    <Modal
      open={agrochemist !== undefined}
      onClose={onClose}
      title={`Отклонить заявку: ${agrochemist?.name ?? ''}`}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Отменить
          </Button>
          <Button size="sm" variant="danger" icon={X} onClick={() => onConfirm(reason)}>
            Отклонить
          </Button>
        </>
      }
    >
      <p className="mb-4">Специалист увидит причину и сможет подать заявку заново.</p>
      <Select
        label="Причина отказа"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        options={REJECTION_REASONS.map((text) => ({ value: text, label: text }))}
      />
    </Modal>
  )
}
