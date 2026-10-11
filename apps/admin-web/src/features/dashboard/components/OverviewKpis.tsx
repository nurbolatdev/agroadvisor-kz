import { StatCard } from '@/components/ui/StatCard'
import type { OverviewStats } from '@/shared/types'
import { formatNumber, formatSigned } from '@/shared/utils/format'

interface OverviewKpisProps {
  stats: OverviewStats
}

export function OverviewKpis({ stats }: OverviewKpisProps) {
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
        changeTone={activeUsers.changePercent >= 0 ? 'positive' : 'negative'}
      />
      <StatCard
        label="Диагнозов"
        value={formatNumber(diagnoses.value)}
        change={`${formatSigned(diagnoses.changePercent)}%`}
        changeTone={diagnoses.changePercent >= 0 ? 'positive' : 'negative'}
      />
      <StatCard
        label="Средняя уверенность"
        value={`${avgConfidence.percent}%`}
        change={`${formatSigned(avgConfidence.changePoints)} п. п.`}
        changeTone={avgConfidence.changePoints >= 0 ? 'positive' : 'negative'}
      />
      <StatCard
        label="Неуверенных (<70%)"
        value={`${lowConfidenceShare.percent}%`}
        change={`${formatSigned(lowConfidenceShare.changePoints)} п. п.`}
        changeTone={lowConfidenceShare.changePoints <= 0 ? 'positive' : 'negative'}
      />
      <StatCard
        label="Открытые жалобы"
        value={formatNumber(openComplaints.value)}
        change={`${formatSigned(openComplaints.changeToday)} за сутки`}
        changeTone={openComplaints.changeToday > 0 ? 'negative' : 'positive'}
      />
      <StatCard
        label="На верификации"
        value={formatNumber(pendingVerifications)}
        change={pendingVerifications > 0 ? 'нужно действие' : 'все проверены'}
        changeTone={pendingVerifications > 0 ? 'negative' : 'positive'}
      />
    </div>
  )
}
