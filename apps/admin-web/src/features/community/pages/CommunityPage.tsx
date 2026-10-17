import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CommunityKpis } from '@/features/community/components/CommunityKpis'
import { ConsultationsCard } from '@/features/community/components/ConsultationsCard'
import { QaActivityChart } from '@/features/community/components/QaActivityChart'
import { TopMembersCard } from '@/features/community/components/TopMembersCard'
import { UnansweredCard } from '@/features/community/components/UnansweredCard'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePeriodOptions } from '@/shared/hooks/usePeriodOptions'
import { useSettings } from '@/shared/settings/settingsContext'
import type { StatsPeriod } from '@/shared/types'
import { cn } from '@/shared/utils/cn'

export function CommunityPage() {
  const { settings } = useSettings()
  const periodOptions = usePeriodOptions()
  const { t } = useTranslation()
  const [period, setPeriod] = useState<StatsPeriod>(settings.defaultPeriod)
  const { data, error, isLoading, reload } = useApiQuery(
    () => api.getCommunityStats(period),
    [period],
  )

  return (
    <>
      <PageHeader
        title="Сообщество"
        subtitle="Активность сообщества фермеров и консультаций агрохимиков"
        actions={
          <SegmentedControl
            label={t('period')}
            options={periodOptions}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      {error ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Не удалось загрузить данные"
            description={error.message}
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reload}>
                Повторить
              </Button>
            }
          />
        </Card>
      ) : data ? (
        <div
          aria-busy={isLoading}
          className={cn('flex flex-col gap-4 transition-opacity', isLoading && 'opacity-60')}
        >
          <CommunityKpis stats={data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,592fr)_minmax(0,360fr)]">
            <QaActivityChart stats={data} />
            <TopMembersCard stats={data} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,592fr)_minmax(0,360fr)]">
            <UnansweredCard questions={data.unanswered} onInvited={reload} />
            <ConsultationsCard consultations={data.consultations} />
          </div>
        </div>
      ) : (
        <Loader />
      )}
    </>
  )
}
