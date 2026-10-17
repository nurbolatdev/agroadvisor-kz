import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { DiagnosesByDayChart } from '@/features/dashboard/components/DiagnosesByDayChart'
import { FarmerFunnel } from '@/features/dashboard/components/FarmerFunnel'
import { NewUsersChart } from '@/features/dashboard/components/NewUsersChart'
import { OverviewKpis } from '@/features/dashboard/components/OverviewKpis'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePeriodOptions } from '@/shared/hooks/usePeriodOptions'
import { useSettings } from '@/shared/settings/settingsContext'
import type { StatsPeriod } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatTime } from '@/shared/utils/format'

export function DashboardPage() {
  const { settings } = useSettings()
  const periodOptions = usePeriodOptions()
  const { t } = useTranslation(['dashboard', 'common'])
  const [period, setPeriod] = useState<StatsPeriod>(settings.defaultPeriod)
  const periodText = t(`common:periodSuffix.${period}`)
  const { data, error, isLoading, reload } = useApiQuery(
    () => api.getOverviewStats(period, settings.confidenceThreshold),
    [period, settings.confidenceThreshold],
  )

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          data
            ? t('subtitleUpdated', { period: periodText, time: formatTime(data.updatedAt) })
            : t('subtitle', { period: periodText })
        }
        actions={
          <SegmentedControl
            label={t('common:period')}
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
            title={t('common:states.loadError')}
            description={error.message}
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reload}>
                {t('common:actions.retry')}
              </Button>
            }
          />
        </Card>
      ) : data ? (
        <div
          aria-busy={isLoading}
          className={cn('flex flex-col gap-4 transition-opacity', isLoading && 'opacity-60')}
        >
          <OverviewKpis stats={data} threshold={settings.confidenceThreshold} />
          <div className="grid gap-4 lg:grid-cols-[592fr_360fr]">
            <DiagnosesByDayChart stats={data} />
            <NewUsersChart stats={data} />
          </div>
          <FarmerFunnel stats={data} />
        </div>
      ) : (
        <Loader />
      )}
    </>
  )
}
