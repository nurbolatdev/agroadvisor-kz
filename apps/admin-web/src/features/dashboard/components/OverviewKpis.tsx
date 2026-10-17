import { useTranslation } from 'react-i18next'
import { StatCard } from '@/components/ui/StatCard'
import type { OverviewStats } from '@/shared/types'
import { formatNumber, formatSigned } from '@/shared/utils/format'

interface OverviewKpisProps {
  stats: OverviewStats
  /** Confidence threshold (%) from the settings, shown in the uncertain diagnoses label. */
  threshold: number
}

export function OverviewKpis({ stats, threshold }: OverviewKpisProps) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'kpi' })
  const {
    activeUsers,
    diagnoses,
    avgConfidence,
    lowConfidenceShare,
    openComplaints,
    pendingVerifications,
  } = stats

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label={t('activeUsers')}
        value={formatNumber(activeUsers.value)}
        change={t('vsPrevious', { change: formatSigned(activeUsers.changePercent) })}
        trend={activeUsers.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('diagnoses')}
        value={formatNumber(diagnoses.value)}
        change={`${formatSigned(diagnoses.changePercent)}%`}
        trend={diagnoses.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('avgConfidence')}
        value={`${avgConfidence.percent}%`}
        change={t('points', { change: formatSigned(avgConfidence.changePoints) })}
        trend={avgConfidence.changePoints >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('lowConfidence', { threshold })}
        value={`${lowConfidenceShare.percent}%`}
        change={t('points', { change: formatSigned(lowConfidenceShare.changePoints) })}
        trend={lowConfidenceShare.changePoints <= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={t('openComplaints')}
        value={formatNumber(openComplaints.value)}
        change={t('perDay', { change: formatSigned(openComplaints.changeToday) })}
        trend={openComplaints.changeToday > 0 ? 'bad' : 'good'}
      />
      <StatCard
        label={t('pendingVerifications')}
        value={formatNumber(pendingVerifications)}
        change={pendingVerifications > 0 ? t('actionNeeded') : t('allVerified')}
        trend={pendingVerifications > 0 ? 'bad' : 'good'}
      />
    </div>
  )
}
