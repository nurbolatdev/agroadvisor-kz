import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { api } from '@/services/api'
import type { AiQualityStats } from '@/shared/types'
import { toCsv, downloadTextFile } from '@/shared/utils/csv'
import { formatNumber } from '@/shared/utils/format'

interface TrainingDataCardProps {
  data: AiQualityStats['trainingData']
}

const CSV_HEADER = [
  'id',
  'crop',
  'ai_label',
  'confirmed_label',
  'confidence',
  'confirmed_by',
  'date',
]

export function TrainingDataCard({ data }: TrainingDataCardProps) {
  const { t } = useTranslation('aiQuality', { keyPrefix: 'trainingData' })
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string>()

  const exportDataset = async () => {
    setIsExporting(true)
    setError(undefined)
    try {
      const samples = await api.getTrainingSamples()
      const csv = toCsv(
        CSV_HEADER,
        samples.map((sample) => [
          sample.id,
          sample.crop,
          sample.aiLabel,
          sample.confirmedLabel,
          sample.confidence,
          sample.confirmedBy,
          sample.date.slice(0, 10),
        ]),
      )
      downloadTextFile(`agroadvisor-dataset-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('exportError'))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <p className="text-[40px] leading-12 font-bold text-primary">{formatNumber(data.labeled)}</p>
      <p className="text-small text-text-muted">{t('ready')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="success">{t('perWeek', { value: formatNumber(data.addedThisWeek) })}</Badge>
        <Badge tone="neutral">{t('classes', { count: data.classes })}</Badge>
      </div>
      <Button
        icon={Download}
        disabled={isExporting}
        onClick={exportDataset}
        className="mt-auto w-full"
      >
        {isExporting ? t('exporting') : t('export')}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
