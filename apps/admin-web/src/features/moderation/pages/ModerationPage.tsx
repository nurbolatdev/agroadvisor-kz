import { ArrowLeft, Inbox, MousePointerClick } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { ComplaintCard } from '@/features/moderation/components/ComplaintCard'
import { ComplaintDetailsPanel } from '@/features/moderation/components/ComplaintDetailsPanel'
import {
  ComplaintFilters,
  type ComplaintFilterValue,
} from '@/features/moderation/components/ComplaintFilters'
import { ModerationKpis } from '@/features/moderation/components/ModerationKpis'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePagination } from '@/shared/hooks/usePagination'
import { cn } from '@/shared/utils/cn'
import { notifyDataChanged } from '@/shared/utils/dataEvents'

export function ModerationPage() {
  const { t } = useTranslation('moderation')
  const [filters, setFilters] = useState<ComplaintFilterValue>({ status: 'new' })
  const [selectedId, setSelectedId] = useState<string>()
  // Below 1024 px the list and the details are separate screens (section 5a).
  const [showDetailsOnMobile, setShowDetailsOnMobile] = useState(false)
  // Another moderator resolved the open case: the notice outlives the reload that removes the case.
  const [stale, setStale] = useState(false)
  const { data: complaints, reload: reloadComplaints } = useApiQuery(
    () => api.getComplaints({ status: filters.status, kind: filters.kind, reason: filters.reason }),
    [filters.status, filters.kind, filters.reason],
  )
  const { data: stats, reload: reloadStats } = useApiQuery(() => api.getModerationStats(), [])
  const reload = () => {
    reloadComplaints()
    reloadStats()
  }

  const visible = complaints ?? []
  const newCount = stats?.newComplaints ?? 0
  const pages = usePagination(visible)
  // The first complaint of the page is open by default, as in the mockup.
  const selected = pages.pageItems.find((item) => item.id === selectedId) ?? pages.pageItems[0]

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<ModerationKpis stats={stats} />} />
      <ComplaintFilters
        value={filters}
        onChange={(value) => {
          setFilters(value)
          setStale(false)
          pages.resetPage()
          setShowDetailsOnMobile(false)
        }}
        newCount={newCount}
      />

      {stale ? (
        <p role="alert" className="mt-4 rounded-2xl bg-primary-soft p-4 text-small text-primary-dark">
          {t('list.stale')}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,400fr)_minmax(0,552fr)]">
        <section
          aria-label={t('list.label')}
          className={cn('flex flex-col gap-3', showDetailsOnMobile && 'hidden lg:flex')}
        >
          {!complaints ? (
            <Loader />
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                title={t('list.empty')}
                description={t('list.emptyDescription')}
              />
            </Card>
          ) : (
            pages.pageItems.map((complaint) => (
              <ComplaintCard
                key={complaint.id}
                complaint={complaint}
                selected={complaint.id === selected?.id}
                onSelect={() => {
                  setStale(false)
                  setSelectedId(complaint.id)
                  setShowDetailsOnMobile(true)
                }}
              />
            ))
          )}
          <Pagination
            page={pages.page}
            pageSize={pages.pageSize}
            total={pages.total}
            onPageChange={pages.setPage}
            onPageSizeChange={pages.setPageSize}
          />
        </section>
        <div className={cn('lg:sticky lg:top-8', !showDetailsOnMobile && 'hidden lg:block')}>
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => setShowDetailsOnMobile(false)}
            className="mb-3 -ml-2 lg:hidden"
          >
            {t('list.back')}
          </Button>
          {selected ? (
            <ComplaintDetailsPanel
              complaint={selected}
              onResolved={() => {
                reload()
                notifyDataChanged()
                setShowDetailsOnMobile(false)
              }}
              onStarted={(id) => {
                // The case moves to the "in work" tab and stays open there.
                setFilters((current) => ({ ...current, status: 'in_progress' }))
                setSelectedId(id)
                pages.resetPage()
                reload()
                notifyDataChanged()
              }}
              onStale={() => {
                setStale(true)
                reload()
                notifyDataChanged()
              }}
            />
          ) : (
            <Card>
              <EmptyState
                icon={MousePointerClick}
                title={t('list.selectTitle')}
                description={t('list.selectDescription')}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
