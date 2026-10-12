import { StatCard } from '@/components/ui/StatCard'
import { PERIOD_SUFFIX } from '@/shared/constants/periods'
import type { CommunityStats } from '@/shared/types'
import { formatDuration, formatNumber, formatSigned } from '@/shared/utils/format'

interface CommunityKpisProps {
  stats: CommunityStats
}

const signedDuration = (minutes: number) =>
  `${minutes < 0 ? '−' : '+'}${formatDuration(Math.abs(minutes))}`

export function CommunityKpis({ stats }: CommunityKpisProps) {
  const { questions, firstAnswerMinutes, resolvedShare, unansweredOver24h } = stats

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={`Вопросов ${PERIOD_SUFFIX[stats.period]}`}
        value={formatNumber(questions.value)}
        change={`${formatSigned(questions.changePercent)}%`}
        trend={questions.changePercent >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Время до первого ответа"
        value={formatDuration(firstAnswerMinutes.value)}
        change={signedDuration(firstAnswerMinutes.changeMinutes)}
        trend={firstAnswerMinutes.changeMinutes <= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Решённых вопросов"
        value={`${resolvedShare.percent}%`}
        change={`${formatSigned(resolvedShare.changePoints)} п. п.`}
        trend={resolvedShare.changePoints >= 0 ? 'good' : 'bad'}
      />
      <StatCard
        label="Без ответа > 24 ч"
        value={formatNumber(unansweredOver24h.value)}
        change={formatSigned(unansweredOver24h.change)}
        trend={unansweredOver24h.change > 0 ? 'bad' : 'good'}
      />
    </div>
  )
}
