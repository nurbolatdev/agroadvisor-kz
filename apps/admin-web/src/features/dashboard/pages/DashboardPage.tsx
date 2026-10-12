import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
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
import { PERIOD_OPTIONS, PERIOD_SUFFIX } from '@/shared/constants/periods'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { StatsPeriod } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatTime } from '@/shared/utils/format'

export function DashboardPage() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { data, error, isLoading, reload } = useApiQuery(
    () => api.getOverviewStats(period),
    [period],
  )

  return (
    <>
      <PageHeader
        title="Обзор"
        subtitle={
          data
            ? `Данные ${PERIOD_SUFFIX[period]} · обновлено сегодня в ${formatTime(data.updatedAt)}`
            : `Данные ${PERIOD_SUFFIX[period]}`
        }
        actions={
          <SegmentedControl
            label="Период"
            options={PERIOD_OPTIONS}
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
          <OverviewKpis stats={data} />
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
