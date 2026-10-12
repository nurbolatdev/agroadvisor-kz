import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ConfidenceHistogram } from '@/features/ai-quality/components/ConfidenceHistogram'
import { api } from '@/services/api'
import { DEFAULT_CONFIDENCE_THRESHOLD } from '@/shared/constants/ai'
import { PERIOD_OPTIONS } from '@/shared/constants/periods'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { StatsPeriod } from '@/shared/types'
import { cn } from '@/shared/utils/cn'

export function AiQualityPage() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { data, error, isLoading, reload } = useApiQuery(
    () => api.getAiQualityStats(period),
    [period],
  )

  return (
    <>
      <PageHeader
        title="Качество ИИ и география"
        subtitle="Качество модели на реальных данных и распространение болезней по районам"
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ConfidenceHistogram
              buckets={data.confidenceHistogram}
              threshold={DEFAULT_CONFIDENCE_THRESHOLD}
            />
          </div>
        </div>
      ) : (
        <Loader />
      )}
    </>
  )
}
