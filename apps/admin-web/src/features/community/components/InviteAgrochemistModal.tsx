import { Star, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { UnansweredQuestion } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatNumber } from '@/shared/utils/format'

interface InviteAgrochemistModalProps {
  question: UnansweredQuestion | undefined
  onClose: () => void
  onInvited: () => void
}

export function InviteAgrochemistModal({
  question,
  onClose,
  onInvited,
}: InviteAgrochemistModalProps) {
  const { t } = useTranslation(['community', 'common'])
  const [selectedId, setSelectedId] = useState<string>()
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string>()
  const { data: agrochemists } = useApiQuery(() => api.getAgrochemists({ status: 'approved' }), [])

  const invite = async () => {
    if (!question || !selectedId) return
    setIsSending(true)
    setError(undefined)
    try {
      await api.inviteAgrochemist(question.id, selectedId)
      onInvited()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('inviteModal.error'))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      open={question !== undefined}
      onClose={onClose}
      title={t('inviteModal.title')}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" icon={UserPlus} disabled={!selectedId || isSending} onClick={invite}>
            {isSending ? t('inviteModal.sending') : t('inviteModal.submit')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-text-muted">{t('inviteModal.prompt', { title: question?.title })}</p>
      {!agrochemists ? (
        <Loader className="py-6" />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('inviteModal.legend')}</legend>
          {agrochemists.map((agrochemist) => (
            <label
              key={agrochemist.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 transition-colors',
                selectedId === agrochemist.id
                  ? 'border-primary bg-primary-soft'
                  : 'border-border hover:bg-bg',
              )}
            >
              <input
                type="radio"
                name="agrochemist"
                value={agrochemist.id}
                checked={selectedId === agrochemist.id}
                onChange={() => setSelectedId(agrochemist.id)}
                className="size-4 accent-primary"
              />
              <Avatar name={agrochemist.name} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-text">{agrochemist.name}</span>
                <span className="block text-caption font-normal text-text-muted">
                  {agrochemist.specialization}
                </span>
              </span>
              {agrochemist.rating ? (
                <span className="flex items-center gap-1 font-semibold text-text">
                  <Star size={14} aria-hidden="true" className="fill-warning text-warning" />
                  {formatNumber(agrochemist.rating)}
                  <span className="sr-only"> {t('outOf5')}</span>
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
