import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { ROUTES } from '@/shared/constants/routes'
import type { CommunityStats } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface TopMembersCardProps {
  stats: CommunityStats
}

export function TopMembersCard({ stats }: TopMembersCardProps) {
  const { t } = useTranslation(['community', 'common'])
  return (
    <Card>
      <CardHeader
        title={t('topMembers.title')}
        subtitle={t('topMembers.subtitle', { period: t(`common:periodSuffix.${stats.period}`) })}
      />
      <ul>
        {stats.topMembers.map((member) => (
          <li key={member.name} className="border-b border-border last:border-b-0">
            <Link
              to={`${ROUTES.users}?search=${encodeURIComponent(member.name)}`}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-bg focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Avatar name={member.name} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-text">
                  {member.name}
                </span>
                {member.role === 'agrochemist' ? (
                  <Badge tone="info">{t('topMembers.roles.agrochemist')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('topMembers.roles.farmer')}</Badge>
                )}
              </span>
              <span className="text-body font-bold text-text">{formatNumber(member.answers)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
