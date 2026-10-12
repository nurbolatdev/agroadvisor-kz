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
  return (
    <Card>
      <CardHeader title="Профиль" subtitle="Как вас видят другие администраторы" />
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={name.trim() || 'А'} size="md" />
        <div>
          <p className="font-semibold text-text">{name.trim() || 'Без имени'}</p>
          <Badge tone="success">Администратор</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Input
          label="Имя"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          error={error}
        />
        <Input label="Email" value={ADMIN_EMAIL} readOnly disabled />
      </div>
    </Card>
  )
}
