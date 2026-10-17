import { useTranslation } from 'react-i18next'
import { StatCard } from '@/components/ui/StatCard'
import type { CommunityStats } from '@/shared/types'
import { formatDuration, formatNumber, formatSigned } from '@/shared/utils/format'

interface CommunityKpisProps {
  stats: CommunityStats
}

const signedDuration = (minutes: number) =>
  `${minutes < 0 ? '−' : '+'}${formatDuration(Math.abs(minutes))}`

export function CommunityKpis({ stats }: CommunityKpisProps) {
  const { t } = useTranslation(['community', 'common'])
  const { questions, firstAnswerMinutes, resolvedShare, unansweredOver24h } = stats

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t('kpi.questions', { period: t(`common:periodSuffix.${stats.period}`) })}
        value={formatNumber(questions.value)}
        change={`${formatSigned(questions.changePercent)}%`}
        trend={questions.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('kpi.firstAnswer')}
        value={formatDuration(firstAnswerMinutes.value)}
        change={signedDuration(firstAnswerMinutes.changeMinutes)}
        trend={firstAnswerMinutes.changeMinutes <= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('kpi.resolved')}
        value={`${resolvedShare.percent}%`}
        change={t('kpi.points', { change: formatSigned(resolvedShare.changePoints) })}
        trend={resolvedShare.changePoints >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('kpi.unanswered')}
        value={formatNumber(unansweredOver24h.value)}
        change={formatSigned(unansweredOver24h.change)}
        trend={unansweredOver24h.change > 0 ? 'bad' : 'good'}
      />
    </div>
  )
}
