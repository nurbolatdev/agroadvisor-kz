import { EyeOff } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ComplaintActions } from '@/features/moderation/components/ComplaintActions'
import { mainReason, POST_KINDS, REASONS, totalReports } from '@/features/moderation/complaints'
import type { ComplaintDetails } from '@/services/api'
import { CROP_LABELS } from '@/shared/constants/crops'
import { formatDayAndTime, formatSince, pluralize } from '@/shared/utils/format'

interface ComplaintDetailsPanelProps {
  complaint: ComplaintDetails
  onResolved: () => void
}

export function ComplaintDetailsPanel({ complaint, onResolved }: ComplaintDetailsPanelProps) {
  const { post, author } = complaint
  const reason = REASONS[mainReason(complaint)]
  const kind = POST_KINDS[post.kind].label.toLowerCase()

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-h2 text-text">Жалоба на {kind}</h2>
        <Badge tone={reason.tone}>
          {reason.label} · {pluralize(totalReports(complaint), ['жалоба', 'жалобы', 'жалоб'])}
        </Badge>
      </div>

      <article className="rounded-2xl border border-border bg-bg/40 p-4">
        <header className="mb-3 flex items-center gap-3">
          <Avatar name={author.name} />
          <div className="min-w-0">
            <p className="text-small font-semibold text-text">{author.name}</p>
            <p className="text-caption font-normal text-text-muted">
              {CROP_LABELS[post.crop]} · {post.district} · {formatDayAndTime(post.createdAt)}
            </p>
          </div>
          {post.hidden ? (
            <Badge tone="neutral" icon={EyeOff} className="ml-auto">
              Скрыт
            </Badge>
          ) : null}
        </header>
        <h3 className="text-body font-semibold text-text">{post.title}</h3>
        <p className="mt-1 text-body text-text-muted">{post.text}</p>
      </article>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-small text-text-muted">Причины жалоб</h3>
          <ul className="flex flex-col gap-1 text-body text-text">
            {complaint.reports.map((report) => (
              <li key={report.reason}>
                {REASONS[report.reason].label} · {report.count}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-small text-text-muted">История автора</h3>
          <ul className="flex flex-col gap-1 text-body text-text">
            <li>На платформе {formatSince(author.registeredAt)}</li>
            <li>{pluralize(author.postsCount, ['публикация', 'публикации', 'публикаций'])}</li>
            <li className={author.warningsCount > 0 ? 'text-danger' : undefined}>
              {author.warningsCount > 0
                ? pluralize(author.warningsCount, [
                    'предупреждение',
                    'предупреждения',
                    'предупреждений',
                  ])
                : 'Без предупреждений'}
            </li>
            {author.status === 'blocked' ? <li className="text-danger">Заблокирован</li> : null}
          </ul>
        </section>
      </div>

      <ComplaintActions key={complaint.id} complaint={complaint} onResolved={onResolved} />
    </Card>
  )
}
