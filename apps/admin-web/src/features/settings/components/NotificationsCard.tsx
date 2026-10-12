import { Card, CardHeader } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
import type { AdminSettings } from '@/shared/settings/settings'

type Notifications = AdminSettings['notifications']

interface NotificationsCardProps {
  value: Notifications
  onChange: (value: Notifications) => void
}

const ITEMS: { key: keyof Notifications; label: string; description: string }[] = [
  { key: 'complaints', label: 'Новые жалобы', description: 'На посты и ответы в сообществе' },
  {
    key: 'verifications',
    label: 'Заявки агрохимиков на верификацию',
    description: 'Новые дипломы и сертификаты',
  },
  {
    key: 'shopRequests',
    label: 'Заявки по агромагазинам',
    description: 'Новые магазины и ошибки в данных',
  },
  {
    key: 'weeklyReport',
    label: 'Еженедельный отчёт на email',
    description: 'Сводка по понедельникам',
  },
]

export function NotificationsCard({ value, onChange }: NotificationsCardProps) {
  return (
    <Card>
      <CardHeader title="Уведомления" subtitle="О чём сообщать администратору" />
      <div className="divide-y divide-border">
        {ITEMS.map((item) => (
          <Switch
            key={item.key}
            label={item.label}
            description={item.description}
            checked={value[item.key]}
            onChange={(checked) => onChange({ ...value, [item.key]: checked })}
          />
        ))}
      </div>
    </Card>
  )
}
