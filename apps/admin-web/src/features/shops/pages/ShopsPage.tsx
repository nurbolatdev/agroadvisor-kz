import { Inbox, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { DistrictCoverageCard } from '@/features/shops/components/DistrictCoverageCard'
import { ShopFilters, type ShopFilterValue } from '@/features/shops/components/ShopFilters'
import { ShopFormModal, type ShopFormTarget } from '@/features/shops/components/ShopFormModal'
import { ShopKpis } from '@/features/shops/components/ShopKpis'
import { ShopRequestCard } from '@/features/shops/components/ShopRequestCard'
import { ShopsTable } from '@/features/shops/components/ShopsTable'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePageParam, usePagination } from '@/shared/hooks/usePagination'
import type { ShopRequest } from '@/shared/types'
import { notifyDataChanged } from '@/shared/utils/dataEvents'

type Tab = 'directory' | 'requests'

export function ShopsPage() {
  const { t } = useTranslation(['shops', 'common'])
  const [filters, setFilters] = useState<ShopFilterValue>({
    search: '',
    district: '',
    status: undefined,
  })
  const [tab, setTab] = useState<Tab>('directory')
  const [formTarget, setFormTarget] = useState<ShopFormTarget>()
  const [busyRequestId, setBusyRequestId] = useState<string>()
  const [requestError, setRequestError] = useState<string>()
  const stats = useApiQuery(() => api.getShopStats(), [])
  // Unfiltered list for the coverage card, independent of the table filters.
  const allShops = useApiQuery(() => api.getShops(), [])
  const shops = useApiQuery(
    () =>
      api.getShops({
        search: filters.search,
        district: filters.district || undefined,
        status: filters.status,
      }),
    [filters.search, filters.district, filters.status],
  )
  const requests = useApiQuery(() => api.getShopRequests(), [])
  // One `?page=` for the active tab: the shops table or the requests list.
  const requestPages = usePagination(requests.data ?? [])
  const tablePage = usePageParam()
  const pending = stats.data?.pendingRequests

  const refresh = () => {
    shops.reload()
    allShops.reload()
    stats.reload()
    requests.reload()
    notifyDataChanged()
  }

  const resolveRequest = async (
    request: ShopRequest,
    status: 'done' | 'rejected',
    before?: () => Promise<unknown>,
  ) => {
    setBusyRequestId(request.id)
    setRequestError(undefined)
    try {
      await before?.()
      await api.resolveShopRequest(request.id, status)
      refresh()
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : t('requests.error'))
    } finally {
      setBusyRequestId(undefined)
    }
  }

  const acceptRequest = (request: ShopRequest) => {
    const shop = allShops.data?.find((item) => item.id === request.shopId)
    if (request.type === 'closed' && shop) {
      resolveRequest(request, 'done', () => api.setShopStatus(shop.id, 'hidden'))
      return
    }
    // New shop and wrong data go through the form; the request closes when it is saved.
    setFormTarget({
      shop: request.type === 'wrong_info' ? shop : undefined,
      initial: request.type === 'new_shop' ? request.payload : undefined,
      note: request.payload.comment,
      requestId: request.id,
    })
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button icon={Plus} onClick={() => setFormTarget({})}>
            {t('add')}
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <ShopKpis stats={stats.data} />
        <SegmentedControl
          label={t('tabs.label')}
          value={tab}
          onChange={(next) => {
            setTab(next)
            requestPages.resetPage()
          }}
          options={[
            { value: 'directory', label: t('tabs.directory') },
            {
              value: 'requests',
              label: pending ? t('tabs.requestsCount', { count: pending }) : t('tabs.requests'),
            },
          ]}
          className="self-start"
        />
        {tab === 'requests' ? (
          <section aria-label={t('requests.label')} className="flex max-w-3xl flex-col gap-3">
            {requestError ? (
              <p role="alert" className="text-small text-danger">
                {requestError}
              </p>
            ) : null}
            {!requests.data ? (
              <Loader />
            ) : requests.data.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Inbox}
                  title={t('requests.empty')}
                  description={t('requests.emptyDescription')}
                />
              </Card>
            ) : (
              requestPages.pageItems.map((request) => (
                <ShopRequestCard
                  key={request.id}
                  request={request}
                  shop={allShops.data?.find((item) => item.id === request.shopId)}
                  busy={busyRequestId === request.id}
                  onReject={() => resolveRequest(request, 'rejected')}
                  onAccept={() => acceptRequest(request)}
                />
              ))
            )}
            <Pagination
              page={requestPages.page}
              pageSize={requestPages.pageSize}
              total={requestPages.total}
              onPageChange={requestPages.setPage}
              onPageSizeChange={requestPages.setPageSize}
            />
          </section>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,640fr)_minmax(0,312fr)]">
            <section aria-label={t('tabs.directory')} className="flex min-w-0 flex-col gap-3">
              <ShopFilters
                value={filters}
                onChange={(next) => {
                  setFilters(next)
                  requestPages.resetPage()
                }}
              />
              {shops.data ? (
                <ShopsTable
                  shops={shops.data}
                  page={tablePage.page}
                  onPageChange={tablePage.setPage}
                  empty={t('table.empty')}
                  extraColumns={[
                    {
                      key: 'edit',
                      header: '',
                      align: 'right',
                      render: (shop) => (
                        <Button size="sm" variant="ghost" onClick={() => setFormTarget({ shop })}>
                          {t('common:actions.edit')}
                        </Button>
                      ),
                    },
                  ]}
                />
              ) : (
                <Loader />
              )}
            </section>
            {allShops.data ? <DistrictCoverageCard shops={allShops.data} /> : <Loader />}
          </div>
        )}
      </div>

      <ShopFormModal
        key={formTarget ? (formTarget.shop?.id ?? 'new') : 'closed'}
        target={formTarget}
        onClose={() => setFormTarget(undefined)}
        onSaved={async () => {
          const requestId = formTarget?.requestId
          setFormTarget(undefined)
          if (requestId) await api.resolveShopRequest(requestId, 'done')
          refresh()
        }}
      />
    </>
  )
}
