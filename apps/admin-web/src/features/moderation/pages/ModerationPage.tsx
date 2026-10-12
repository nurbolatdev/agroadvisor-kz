import { ArrowLeft, Inbox, MousePointerClick } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { ComplaintCard } from '@/features/moderation/components/ComplaintCard'
import { ComplaintDetailsPanel } from '@/features/moderation/components/ComplaintDetailsPanel'
import {
  ComplaintFilters,
  type ComplaintFilterValue,
} from '@/features/moderation/components/ComplaintFilters'
import { ModerationKpis } from '@/features/moderation/components/ModerationKpis'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { cn } from '@/shared/utils/cn'
import { notifyDataChanged } from '@/shared/utils/dataEvents'

export function ModerationPage() {
  const [filters, setFilters] = useState<ComplaintFilterValue>({ status: 'new' })
  const [selectedId, setSelectedId] = useState<string>()
  // Below 1024 px the list and the details are separate screens (section 5a).
  const [showDetailsOnMobile, setShowDetailsOnMobile] = useState(false)
  const { data: complaints, reload } = useApiQuery(
    () => api.getComplaints({ kind: filters.kind, reason: filters.reason }),
    [filters.kind, filters.reason],
  )

  const visible = complaints?.filter((item) => item.status === filters.status) ?? []
  const newCount = complaints?.filter((item) => item.status === 'new').length ?? 0
  // The first complaint is open by default, as in the mockup.
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0]

  return (
    <>
      <PageHeader
        title="Модерация"
        subtitle="Жалобы пользователей на посты и ответы в сообществе"
        actions={<ModerationKpis />}
      />
      <ComplaintFilters
        value={filters}
        onChange={(value) => {
          setFilters(value)
          setShowDetailsOnMobile(false)
        }}
        newCount={newCount}
      />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,400fr)_minmax(0,552fr)]">
        <section
          aria-label="Список жалоб"
          className={cn('flex flex-col gap-3', showDetailsOnMobile && 'hidden lg:flex')}
        >
          {!complaints ? (
            <Loader />
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                title="Жалоб нет"
                description="По этим фильтрам ничего не найдено."
              />
            </Card>
          ) : (
            visible.map((complaint) => (
              <ComplaintCard
                key={complaint.id}
                complaint={complaint}
                selected={complaint.id === selected?.id}
                onSelect={() => {
                  setSelectedId(complaint.id)
                  setShowDetailsOnMobile(true)
                }}
              />
            ))
          )}
        </section>
        <div className={cn('lg:sticky lg:top-8', !showDetailsOnMobile && 'hidden lg:block')}>
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => setShowDetailsOnMobile(false)}
            className="mb-3 -ml-2 lg:hidden"
          >
            К списку
          </Button>
          {selected ? (
            <ComplaintDetailsPanel
              complaint={selected}
              onResolved={() => {
                reload()
                notifyDataChanged()
                setShowDetailsOnMobile(false)
              }}
            />
          ) : (
            <Card>
              <EmptyState
                icon={MousePointerClick}
                title="Выберите жалобу"
                description="Детали жалобы и действия появятся здесь."
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
