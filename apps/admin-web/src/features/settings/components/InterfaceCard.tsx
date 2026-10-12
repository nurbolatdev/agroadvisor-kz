import { Card, CardHeader } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PERIOD_OPTIONS } from '@/shared/constants/periods'
import { type Language, LANGUAGE_OPTIONS } from '@/shared/settings/settings'
import type { StatsPeriod } from '@/shared/types'

interface InterfaceCardProps {
  language: Language
  defaultPeriod: StatsPeriod
  onLanguageChange: (language: Language) => void
  onPeriodChange: (period: StatsPeriod) => void
}

export function InterfaceCard({
  language,
  defaultPeriod,
  onLanguageChange,
  onPeriodChange,
}: InterfaceCardProps) {
  return (
    <Card>
      <CardHeader title="Интерфейс" subtitle="Язык и период, с которого открывается аналитика" />
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-small font-medium text-text">Язык</p>
          <SegmentedControl
            label="Язык интерфейса"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={onLanguageChange}
          />
          <p className="mt-1.5 text-caption font-normal text-text-muted">
            Тот же выбор, что в меню. Переводы kk и en подключаются после v0.1.0.
          </p>
        </div>
        <div>
          <p className="mb-2 text-small font-medium text-text">Период по умолчанию</p>
          <SegmentedControl
            label="Период по умолчанию"
            options={PERIOD_OPTIONS}
            value={defaultPeriod}
            onChange={onPeriodChange}
          />
          <p className="mt-1.5 text-caption font-normal text-text-muted">
            С него открываются Обзор, Качество ИИ и Сообщество.
          </p>
        </div>
      </div>
    </Card>
  )
}
