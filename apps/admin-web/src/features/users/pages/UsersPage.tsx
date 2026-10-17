import { CircleCheck, Ban } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchBar } from '@/components/ui/SearchBar'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePageParam } from '@/shared/hooks/usePagination'
import type { User, UserRole } from '@/shared/types'
import { formatNumber, formatRelativeTime, formatShortDate } from '@/shared/utils/format'

const ROLE_FILTERS: (UserRole | undefined)[] = [undefined, 'farmer', 'agrochemist']

export function UsersPage() {
  const { t } = useTranslation(['users', 'common'])
  const [role, setRole] = useState<UserRole>()
  // `?search=` lets other pages link to a person, e.g. the community's most active members.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const { page, setPage, resetPage } = usePageParam()
  const { data: users } = useApiQuery(() => api.getUsers({ role, search }), [role, search])

  const columns: DataTableColumn<User>[] = [
    {
      key: 'name',
      header: t('columns.user'),
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
      header: t('columns.role'),
      render: (user) => (
        <Badge tone={user.role === 'agrochemist' ? 'info' : 'success'}>
          {t(`roles.${user.role}`)}
        </Badge>
      ),
    },
    {
      key: 'crops',
      header: t('columns.crops'),
      render: (user) => user.crops.map((crop) => t(`common:crops.${crop}`)).join(', '),
    },
    {
      key: 'activity',
      header: t('columns.activity'),
      className: 'whitespace-nowrap',
      render: (user) => (
        <span className="text-text-muted">
          {user.role === 'farmer'
            ? t('diagnoses', { count: user.diagnosesCount })
            : t('answers', { count: user.postsCount })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      className: 'whitespace-nowrap',
      render: (user) =>
        user.status === 'active' ? (
          <Badge tone="success" icon={CircleCheck}>
            {t('statuses.active')}
          </Badge>
        ) : (
          <Badge tone="danger" icon={Ban}>
            {t('statuses.blocked')}
          </Badge>
        ),
    },
    {
      key: 'dates',
      header: t('columns.registered'),
      className: 'whitespace-nowrap',
      render: (user) => (
        <span>
          <span className="block">{formatShortDate(user.registeredAt)}</span>
          <span className="block text-caption font-normal text-text-muted">
            {t('lastActive', { time: formatRelativeTime(user.lastActiveAt) })}
          </span>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          users
            ? t('summary', {
                users: t('count', { count: users.length }),
                blocked: formatNumber(users.filter((user) => user.status === 'blocked').length),
              })
            : t('subtitle')
        }
        actions={
          <SearchBar
            label={t('search')}
            placeholder={t('search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
            containerClassName="w-72"
          />
        }
      />
      <div role="toolbar" aria-label={t('roleFilter')} className="mb-4 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((value) => (
          <Chip
            key={value ?? 'all'}
            selected={role === value}
            onClick={() => {
              setRole(value)
              resetPage()
            }}
          >
            {t(`filters.${value ?? 'all'}`)}
          </Chip>
        ))}
      </div>
      {users ? (
        <DataTable
          columns={columns}
          data={users}
          getRowKey={(user) => user.id}
          page={page}
          onPageChange={setPage}
          empty={t('empty')}
        />
      ) : (
        <Loader />
      )}
    </>
  )
}
