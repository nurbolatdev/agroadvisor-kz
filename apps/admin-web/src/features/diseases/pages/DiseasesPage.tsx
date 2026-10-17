import { SearchX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchBar } from '@/components/ui/SearchBar'
import { CropFilter } from '@/features/diseases/components/CropFilter'
import { DiseaseCard } from '@/features/diseases/components/DiseaseCard'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { usePagination } from '@/shared/hooks/usePagination'
import type { CropId } from '@/shared/types'

export function DiseasesPage() {
  const { t } = useTranslation('diseases')
  const [crop, setCrop] = useState<CropId>()
  const [search, setSearch] = useState('')
  const { data: diseases } = useApiQuery(() => api.getDiseases({ crop }), [crop])

  const query = search.trim().toLowerCase()
  const visible =
    diseases?.filter(
      (disease) =>
        !query ||
        disease.name.toLowerCase().includes(query) ||
        disease.latinName.toLowerCase().includes(query),
    ) ?? []
  // Catalog cards come in rows of 3, so pages hold 12 (section 5b).
  const pages = usePagination(visible, 12)

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          diseases
            ? t('summary', { entries: t('entries', { count: visible.length }) })
            : t('subtitle')
        }
        actions={
          <SearchBar
            label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              pages.resetPage()
            }}
            containerClassName="w-72"
          />
        }
      />
      <CropFilter
        value={crop}
        onChange={(next) => {
          setCrop(next)
          pages.resetPage()
        }}
      />

      <div className="mt-4">
        {!diseases ? (
          <Loader />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={SearchX}
              title={t('notFound')}
              description={t('notFoundDescription')}
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pages.pageItems.map((disease) => (
                <DiseaseCard key={disease.id} disease={disease} />
              ))}
            </div>
            <Pagination
              page={pages.page}
              pageSize={pages.pageSize}
              total={pages.total}
              onPageChange={pages.setPage}
              onPageSizeChange={pages.setPageSize}
              pageSizeOptions={[12, 24, 48]}
              className="mt-4"
            />
          </>
        )}
      </div>
    </>
  )
}
