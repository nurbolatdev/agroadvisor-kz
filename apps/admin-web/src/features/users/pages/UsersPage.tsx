import { CircleCheck, Ban } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchBar } from '@/components/ui/SearchBar'
import { api } from '@/services/api'
import { CROP_LABELS } from '@/shared/constants/crops'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { User, UserRole } from '@/shared/types'
import { formatNumber, formatRelativeTime, formatShortDate, pluralize } from '@/shared/utils/format'

const ROLE_FILTERS: { value: UserRole | undefined; label: string }[] = [
  { value: undefined, label: 'Все' },
  { value: 'farmer', label: 'Фермеры' },
  { value: 'agrochemist', label: 'Агрохимики' },
]

const COLUMNS: DataTableColumn<User>[] = [
  {
    key: 'name',
    header: 'Пользователь',
    render: (user) => (
      <span className="flex items-center gap-3">
        <Avatar name={user.name} size="md" />
        <span>
          <span className="block font-semibold">{user.name}</span>
          <span className="block text-caption font-normal text-text-muted">
            {user.district}, {user.region}
          </span>
        </span>
      </span>
    ),
  },
  {
    key: 'role',
    header: 'Роль',
    render: (user) =>
      user.role === 'agrochemist' ? (
        <Badge tone="info">Агрохимик</Badge>
      ) : (
        <Badge tone="success">Фермер</Badge>
      ),
  },
  {
    key: 'crops',
    header: 'Культуры',
    render: (user) => user.crops.map((crop) => CROP_LABELS[crop]).join(', '),
  },
  {
    key: 'activity',
    header: 'Активность',
    className: 'whitespace-nowrap',
    render: (user) => (
      <span className="text-text-muted">
        {user.role === 'farmer'
          ? pluralize(user.diagnosesCount, ['диагноз', 'диагноза', 'диагнозов'])
          : pluralize(user.postsCount, ['ответ', 'ответа', 'ответов'])}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Статус',
    className: 'whitespace-nowrap',
    render: (user) =>
      user.status === 'active' ? (
        <Badge tone="success" icon={CircleCheck}>
          Активен
        </Badge>
      ) : (
        <Badge tone="danger" icon={Ban}>
          Заблокирован
        </Badge>
      ),
  },
  {
    key: 'dates',
    header: 'Регистрация',
    className: 'whitespace-nowrap',
    render: (user) => (
      <span>
        <span className="block">{formatShortDate(user.registeredAt)}</span>
        <span className="block text-caption font-normal text-text-muted">
          в сети {formatRelativeTime(user.lastActiveAt)}
        </span>
      </span>
    ),
  },
]

export function UsersPage() {
  const [role, setRole] = useState<UserRole>()
  const [search, setSearch] = useState('')
  const { data: users } = useApiQuery(() => api.getUsers({ role, search }), [role, search])

  return (
    <>
      <PageHeader
        title="Пользователи"
        subtitle={
          users
            ? `${pluralize(users.length, ['пользователь', 'пользователя', 'пользователей'])} · заблокировано: ${formatNumber(users.filter((user) => user.status === 'blocked').length)}`
            : 'Фермеры и агрохимики платформы'
        }
        actions={
          <SearchBar
            label="Поиск по имени"
            placeholder="Поиск по имени"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="w-72"
          />
        }
      />
      <div role="toolbar" aria-label="Роль" className="mb-4 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((filter) => (
          <Chip
            key={filter.label}
            selected={role === filter.value}
            onClick={() => setRole(filter.value)}
          >
            {filter.label}
          </Chip>
        ))}
      </div>
      {users ? (
        <DataTable
          columns={COLUMNS}
          data={users}
          getRowKey={(user) => user.id}
          empty="Никого не нашли"
        />
      ) : (
        <Loader />
      )}
    </>
  )
}
