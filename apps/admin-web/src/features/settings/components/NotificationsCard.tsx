import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
import type { AdminSettings } from '@/shared/settings/settings'

type Notifications = AdminSettings['notifications']

interface NotificationsCardProps {
  value: Notifications
  onChange: (value: Notifications) => void
}

const ITEMS: (keyof Notifications)[] = [
  'complaints',
  'verifications',
  'shopRequests',
  'weeklyReport',
]

export function NotificationsCard({ value, onChange }: NotificationsCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'notifications' })
  return (
    <Card>
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="divide-y divide-border">
        {ITEMS.map((key) => (
          <Switch
            key={key}
            label={t(`items.${key}.label`)}
            description={t(`items.${key}.description`)}
            checked={value[key]}
            onChange={(checked) => onChange({ ...value, [key]: checked })}
          />
        ))}
      </div>
    </Card>
  )
}
