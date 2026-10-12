import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InviteAgrochemistModal } from '@/features/community/components/InviteAgrochemistModal'
import { CROP_LABELS } from '@/shared/constants/crops'
import type { UnansweredQuestion } from '@/shared/types'
import { pluralize } from '@/shared/utils/format'

interface UnansweredCardProps {
  questions: UnansweredQuestion[]
  onInvited: () => void
}

const VISIBLE_BY_DEFAULT = 3

export function UnansweredCard({ questions, onInvited }: UnansweredCardProps) {
  const [showAll, setShowAll] = useState(false)
  const [inviting, setInviting] = useState<UnansweredQuestion>()
  const visible = showAll ? questions : questions.slice(0, VISIBLE_BY_DEFAULT)

  return (
    <Card>
      <CardHeader
        title="Без ответа больше 24 часов"
        subtitle="стоит подключить агрохимика"
        action={
          questions.length > 0 ? (
            <Badge tone="warning">
              {pluralize(questions.length, ['вопрос', 'вопроса', 'вопросов'])}
            </Badge>
          ) : null
        }
      />
      {questions.length === 0 ? (
        <EmptyState icon={CircleCheck} title="На все вопросы ответили" className="py-6" />
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
                  {CROP_LABELS[question.crop]} · {question.district}
                </span>
              </span>
              <span className="text-small text-text-muted">{question.hoursWithoutAnswer} ч</span>
              {question.invitedAgrochemist ? (
                <Badge tone="success" icon={CircleCheck}>
                  Агрохимик приглашён · {question.invitedAgrochemist.name}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setInviting(question)}
                  className="border-primary text-primary"
                >
                  Позвать агрохимика
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
          {showAll ? 'Свернуть' : `Показать все (${questions.length})`}
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
