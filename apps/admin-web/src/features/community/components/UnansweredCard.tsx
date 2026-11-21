import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InviteAgrochemistModal } from '@/features/community/components/InviteAgrochemistModal'
import { API_MODE } from '@/services/config'
import type { UnansweredQuestion } from '@/shared/types'

interface UnansweredCardProps {
  questions: UnansweredQuestion[]
  /** Overall number of such questions; the list itself may be shorter. */
  total: number
  onInvited: () => void
}

const VISIBLE_BY_DEFAULT = 3

/** The invitation has no backend endpoint yet (B12.5c): only the mock API can take it. */
const INVITE_AVAILABLE = API_MODE === 'mock'

export function UnansweredCard({ questions, total, onInvited }: UnansweredCardProps) {
  const { t } = useTranslation(['community', 'common'])
  const [showAll, setShowAll] = useState(false)
  const [inviting, setInviting] = useState<UnansweredQuestion>()
  const visible = showAll ? questions : questions.slice(0, VISIBLE_BY_DEFAULT)

  return (
    <Card>
      <CardHeader
        title={t('unanswered.title')}
        subtitle={t('unanswered.subtitle')}
        action={
          questions.length > 0 ? (
            <Badge tone="warning">{t('unanswered.count', { count: total })}</Badge>
          ) : null
        }
      />
      {questions.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t('unanswered.allAnswered')} className="py-6" />
      ) : (
        <ul>
          {visible.map((question) => (
            <li
              key={question.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 basis-56">
                <span className="block text-small font-semibold text-text">{question.title}</span>
                <span className="block text-caption font-normal text-text-muted">
                  {t(`common:crops.${question.crop}`)} · {question.district}
                </span>
              </span>
              <span className="text-small text-text-muted">
                {t('unanswered.hours', { hours: question.hoursWithoutAnswer })}
              </span>
              {question.invitedAgrochemist ? (
                <Badge tone="success" icon={CircleCheck}>
                  {t('unanswered.invited', { name: question.invitedAgrochemist.name })}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!INVITE_AVAILABLE}
                  title={INVITE_AVAILABLE ? undefined : t('unanswered.inviteUnavailable')}
                  onClick={() => setInviting(question)}
                  className="border-primary text-primary"
                >
                  {t('unanswered.invite')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {questions.length > VISIBLE_BY_DEFAULT ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1 -ml-3"
        >
          {showAll
            ? t('common:actions.collapse')
            : t('common:actions.showAll', { count: total })}
        </Button>
      ) : null}

      <InviteAgrochemistModal
        key={inviting?.id}
        question={inviting}
        onClose={() => setInviting(undefined)}
        onInvited={() => {
          setInviting(undefined)
          onInvited()
        }}
      />
    </Card>
  )
}
