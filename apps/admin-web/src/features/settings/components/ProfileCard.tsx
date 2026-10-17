import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

interface ProfileCardProps {
  name: string
  onNameChange: (name: string) => void
  error?: string
}

const ADMIN_EMAIL = 'admin@agroadvisor.kz'

export function ProfileCard({ name, onNameChange, error }: ProfileCardProps) {
  const { t } = useTranslation(['settings', 'common'])
  const shownName = name.trim() || t('profile.noName')
  return (
    <Card>
      <CardHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={shownName} size="md" />
        <div>
          <p className="font-semibold text-text">{shownName}</p>
          <Badge tone="success">{t('common:role.admin')}</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Input
          label={t('profile.name')}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          error={error}
        />
        <Input label={t('profile.email')} value={ADMIN_EMAIL} readOnly disabled />
      </div>
    </Card>
  )
}
