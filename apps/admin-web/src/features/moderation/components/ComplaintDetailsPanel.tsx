import { EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ComplaintActions } from '@/features/moderation/components/ComplaintActions'
import { mainReason, REASON_TONES, totalReports } from '@/features/moderation/complaints'
import type { ComplaintDetails } from '@/services/api'
import { formatDayAndTime, formatSince } from '@/shared/utils/format'

interface ComplaintDetailsPanelProps {
  complaint: ComplaintDetails
  onResolved: () => void
}

export function ComplaintDetailsPanel({ complaint, onResolved }: ComplaintDetailsPanelProps) {
  const { post, author } = complaint
  const { t } = useTranslation(['moderation', 'common'])
  const reason = mainReason(complaint)

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="text-h2 text-text">{t(`details.title.${post.kind}`)}</h2>
        <Badge tone={REASON_TONES[reason]}>
          {t(`reasons.${reason}`)} · {t('reports', { count: totalReports(complaint) })}
        </Badge>
      </div>

      <article className="rounded-2xl border border-border bg-bg/40 p-4">
        <header className="mb-3 flex items-center gap-3">
          <Avatar name={author.name} />
          <div className="min-w-0">
            <p className="text-small font-semibold text-text">{author.name}</p>
            <p className="text-caption font-normal text-text-muted">
              {t(`common:crops.${post.crop}`)} · {post.district} ·{' '}
              {formatDayAndTime(post.createdAt)}
            </p>
          </div>
          {post.hidden ? (
            <Badge tone="neutral" icon={EyeOff} className="ml-auto">
              {t('details.hidden')}
            </Badge>
          ) : null}
        </header>
        <h3 className="text-body font-semibold text-text">{post.title}</h3>
        <p className="mt-1 text-body text-text-muted">{post.text}</p>
      </article>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-small text-text-muted">{t('details.reasons')}</h3>
          <ul className="flex flex-col gap-1 text-body text-text">
            {complaint.reports.map((report) => (
              <li key={report.reason}>
                {t(`reasons.${report.reason}`)} · {report.count}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-small text-text-muted">{t('details.history')}</h3>
          <ul className="flex flex-col gap-1 text-body text-text">
            <li>{t('details.onPlatform', { since: formatSince(author.registeredAt) })}</li>
            <li>{t('details.posts', { count: author.postsCount })}</li>
            <li className={author.warningsCount > 0 ? 'text-danger' : undefined}>
              {author.warningsCount > 0
                ? t('details.warnings', { count: author.warningsCount })
                : t('details.noWarnings')}
            </li>
            {author.status === 'blocked' ? (
              <li className="text-danger">{t('details.blocked')}</li>
            ) : null}
          </ul>
        </section>
      </div>

      <ComplaintActions key={complaint.id} complaint={complaint} onResolved={onResolved} />
    </Card>
  )
}
