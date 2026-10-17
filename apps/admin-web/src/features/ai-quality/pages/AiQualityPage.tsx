import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ConfidenceHistogram } from '@/features/ai-quality/components/ConfidenceHistogram'
import { DiseaseGeographyCard } from '@/features/ai-quality/components/DiseaseGeographyCard'
import { MismatchesCard } from '@/features/ai-quality/components/MismatchesCard'
import { TopDiseasesCard } from '@/features/ai-quality/components/TopDiseasesCard'
import { TrainingDataCard } from '@/features/ai-quality/components/TrainingDataCard'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePeriodOptions } from '@/shared/hooks/usePeriodOptions'
import { useSettings } from '@/shared/settings/settingsContext'
import type { StatsPeriod } from '@/shared/types'
import { cn } from '@/shared/utils/cn'

export function AiQualityPage() {
  const { settings } = useSettings()
  const periodOptions = usePeriodOptions()
  const { t } = useTranslation()
  const [period, setPeriod] = useState<StatsPeriod>(settings.defaultPeriod)
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ConfidenceHistogram
              buckets={data.confidenceHistogram}
              threshold={settings.confidenceThreshold}
            />
            <TopDiseasesCard diseases={data.topDiseases} period={period} />
            <TrainingDataCard data={data.trainingData} />
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <MismatchesCard mismatches={data.mismatches} />
            <DiseaseGeographyCard geography={data.geography} />
          </div>
        </div>
      ) : (
        <Loader />
      )}
    </>
  )
}
