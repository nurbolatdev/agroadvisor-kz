import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { THRESHOLD_RANGE } from '@/shared/settings/settings'

interface AiModelCardProps {
  /** Raw field text, so a half-typed value does not jump. */
  value: string
  onChange: (value: string) => void
  error?: string
}

export function AiModelCard({ value, onChange, error }: AiModelCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'aiModel' })
  return (
    <Card>
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <Input
        label={t('threshold')}
        type="number"
        inputMode="numeric"
        min={THRESHOLD_RANGE.min}
        max={THRESHOLD_RANGE.max}
        step={THRESHOLD_RANGE.step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        containerClassName="max-w-48"
      />
      <p className="mt-3 text-small text-text-muted">{t('hint')}</p>
    </Card>
  )
}
