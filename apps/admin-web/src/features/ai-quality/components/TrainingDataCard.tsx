import { Download } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { api } from '@/services/api'
import type { AiQualityStats } from '@/shared/types'
import { toCsv, downloadTextFile } from '@/shared/utils/csv'
import { formatNumber, pluralize } from '@/shared/utils/format'

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
      setError(reason instanceof Error ? reason.message : 'Не удалось подготовить файл')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Данные для дообучения"
        subtitle="случаи, подтверждённые агрохимиком или сообществом"
      />
      <p className="text-[40px] leading-12 font-bold text-primary">{formatNumber(data.labeled)}</p>
      <p className="text-small text-text-muted">размеченных фото готовы к экспорту</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="success">+{formatNumber(data.addedThisWeek)} за неделю</Badge>
        <Badge tone="neutral">{pluralize(data.classes, ['класс', 'класса', 'классов'])}</Badge>
      </div>
      <Button
        icon={Download}
        disabled={isExporting}
        onClick={exportDataset}
        className="mt-auto w-full"
      >
        {isExporting ? 'Готовим файл…' : 'Экспорт датасета'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
