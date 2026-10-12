import { StatCard } from '@/components/ui/StatCard'
import type { OverviewStats } from '@/shared/types'
import { formatNumber, formatSigned } from '@/shared/utils/format'

interface OverviewKpisProps {
  stats: OverviewStats
  /** Confidence threshold (%) from the settings, shown in the uncertain diagnoses label. */
  threshold: number
}

export function OverviewKpis({ stats, threshold }: OverviewKpisProps) {
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
        label="Активные пользователи"
        value={formatNumber(activeUsers.value)}
        change={`${formatSigned(activeUsers.changePercent)}% к прошлому периоду`}
        trend={activeUsers.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Диагнозов"
        value={formatNumber(diagnoses.value)}
        change={`${formatSigned(diagnoses.changePercent)}%`}
        trend={diagnoses.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Средняя уверенность"
        value={`${avgConfidence.percent}%`}
        change={`${formatSigned(avgConfidence.changePoints)} п. п.`}
        trend={avgConfidence.changePoints >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label={`Неуверенных (<${threshold}%)`}
        value={`${lowConfidenceShare.percent}%`}
        change={`${formatSigned(lowConfidenceShare.changePoints)} п. п.`}
        trend={lowConfidenceShare.changePoints <= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Открытые жалобы"
        value={formatNumber(openComplaints.value)}
        change={`${formatSigned(openComplaints.changeToday)} за сутки`}
        trend={openComplaints.changeToday > 0 ? 'bad' : 'good'}
      />
      <StatCard
        label="На верификации"
        value={formatNumber(pendingVerifications)}
        change={pendingVerifications > 0 ? 'нужно действие' : 'все проверены'}
        trend={pendingVerifications > 0 ? 'bad' : 'good'}
      />
    </div>
  )
}
