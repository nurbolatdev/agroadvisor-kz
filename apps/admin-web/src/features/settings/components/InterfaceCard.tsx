import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { usePeriodOptions } from '@/shared/hooks/usePeriodOptions'
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
  const periodOptions = usePeriodOptions()
  const { t } = useTranslation('settings', { keyPrefix: 'interface' })
  return (
    <Card>
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-small font-medium text-text">{t('language')}</p>
          <SegmentedControl
            label={t('languageLabel')}
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={onLanguageChange}
          />
          <p className="mt-1.5 text-caption font-normal text-text-muted">{t('languageHint')}</p>
        </div>
        <div>
          <p className="mb-2 text-small font-medium text-text">{t('period')}</p>
          <SegmentedControl
            label={t('period')}
            options={periodOptions}
            value={defaultPeriod}
            onChange={onPeriodChange}
          />
          <p className="mt-1.5 text-caption font-normal text-text-muted">{t('periodHint')}</p>
        </div>
      </div>
    </Card>
  )
}
