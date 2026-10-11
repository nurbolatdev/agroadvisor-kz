import { Ban, Check, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { mainReason } from '@/features/moderation/complaints'
import { api, type ComplaintDetails } from '@/services/api'
import type { ComplaintReason, ModerationAction } from '@/shared/types'
import { formatDayAndTime } from '@/shared/utils/format'

interface ComplaintActionsProps {
  complaint: ComplaintDetails
  onResolved: () => void
}

const DECISION_REASONS: Record<ComplaintReason, string> = {
  ads: 'Реклама и продажа товаров запрещены правилами',
  misinformation: 'Опасный или недостоверный совет',
  spam: 'Спам и повторяющиеся сообщения',
  abuse: 'Оскорбления и грубость',
}

const KEEP_COMMENT = 'Нарушений не найдено'

const ACTION_RESULT: Record<ModerationAction, string> = {
  keep: 'Публикация оставлена',
  hide: 'Публикация скрыта',
  block: 'Публикация скрыта, автор заблокирован',
}

export function ComplaintActions({ complaint, onResolved }: ComplaintActionsProps) {
  const [decision, setDecision] = useState(DECISION_REASONS[mainReason(complaint)])
  const [pending, setPending] = useState<ModerationAction>()
  const [error, setError] = useState<string>()
  const [confirmBlock, setConfirmBlock] = useState(false)

  if (complaint.resolution) {
    const { action, comment, resolvedAt } = complaint.resolution
    return (
      <div className="rounded-2xl bg-primary-soft p-4 text-small text-primary-dark">
        <p className="font-semibold">{ACTION_RESULT[action]}</p>
        <p className="mt-0.5">
          {comment} · {formatDayAndTime(resolvedAt)}
        </p>
      </div>
    )
  }

  const resolve = async (action: ModerationAction) => {
    setConfirmBlock(false)
    setPending(action)
    setError(undefined)
    try {
      await api.resolveComplaint(complaint.id, action, action === 'keep' ? KEEP_COMMENT : decision)
      onResolved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить решение')
    } finally {
      setPending(undefined)
    }
  }

  const kind = complaint.post.kind === 'post' ? 'пост' : 'ответ'

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Причина решения"
        value={decision}
        onChange={(event) => setDecision(event.target.value)}
        options={Object.values(DECISION_REASONS).map((text) => ({ value: text, label: text }))}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          variant="secondary"
          icon={Check}
          disabled={pending !== undefined}
          onClick={() => resolve('keep')}
        >
          {pending === 'keep' ? 'Сохраняем…' : 'Оставить'}
        </Button>
        <Button icon={EyeOff} disabled={pending !== undefined} onClick={() => resolve('hide')}>
          {pending === 'hide' ? 'Скрываем…' : `Скрыть ${kind}`}
        </Button>
        <Button
          variant="danger"
          icon={Ban}
          disabled={pending !== undefined}
          onClick={() => setConfirmBlock(true)}
        >
          {pending === 'block' ? 'Блокируем…' : 'Заблокировать'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Modal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Заблокировать ${complaint.author.name}?`}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirmBlock(false)}>
              Отменить
            </Button>
            <Button size="sm" variant="danger" icon={Ban} onClick={() => resolve('block')}>
              Заблокировать
            </Button>
          </>
        }
      >
        Публикация будет скрыта, а автор больше не сможет писать в сообществе. Причина: {decision}.
      </Modal>
    </div>
  )
}
