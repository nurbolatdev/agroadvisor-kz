import { Ban, Check, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { mainReason, REASON_ORDER } from '@/features/moderation/complaints'
import { api, type ComplaintDetails } from '@/services/api'
import type { ComplaintReason, ModerationAction } from '@/shared/types'
import { formatDayAndTime } from '@/shared/utils/format'

interface ComplaintActionsProps {
  complaint: ComplaintDetails
  onResolved: () => void
}

export function ComplaintActions({ complaint, onResolved }: ComplaintActionsProps) {
  const { t } = useTranslation(['moderation', 'common'])
  const [decision, setDecision] = useState<ComplaintReason>(mainReason(complaint))
  const decisionText = t(`actions.decisions.${decision}`)
  const [pending, setPending] = useState<ModerationAction>()
  const [error, setError] = useState<string>()
  const [confirmBlock, setConfirmBlock] = useState(false)

  if (complaint.resolution) {
    const { action, comment, resolvedAt } = complaint.resolution
    return (
      <div className="rounded-2xl bg-primary-soft p-4 text-small text-primary-dark">
        <p className="font-semibold">{t(`actions.results.${action}`)}</p>
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
      // The comment is saved as text in the admin's language, like any other content.
      const comment = action === 'keep' ? t('actions.keepComment') : decisionText
      await api.resolveComplaint(complaint.id, action, comment)
      onResolved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('actions.saveError'))
    } finally {
      setPending(undefined)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        label={t('actions.decisionLabel')}
        value={decision}
        onChange={(event) => setDecision(event.target.value as ComplaintReason)}
        options={REASON_ORDER.map((reason) => ({
          value: reason,
          label: t(`actions.decisions.${reason}`),
        }))}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          variant="secondary"
          icon={Check}
          disabled={pending !== undefined}
          onClick={() => resolve('keep')}
        >
          {pending === 'keep' ? t('actions.saving') : t('actions.keep')}
        </Button>
        <Button icon={EyeOff} disabled={pending !== undefined} onClick={() => resolve('hide')}>
          {pending === 'hide' ? t('actions.hiding') : t(`actions.hide.${complaint.post.kind}`)}
        </Button>
        <Button
          variant="danger"
          icon={Ban}
          disabled={pending !== undefined}
          onClick={() => setConfirmBlock(true)}
        >
          {pending === 'block' ? t('actions.blocking') : t('actions.block')}
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
        title={t('actions.confirmTitle', { name: complaint.author.name })}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirmBlock(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" variant="danger" icon={Ban} onClick={() => resolve('block')}>
              {t('actions.block')}
            </Button>
          </>
        }
      >
        {t('actions.confirmText', { reason: decisionText })}
      </Modal>
    </div>
  )
}
