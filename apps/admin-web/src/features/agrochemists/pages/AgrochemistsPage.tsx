import { useState } from 'react'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchBar } from '@/components/ui/SearchBar'
import { AgrochemistsTable } from '@/features/agrochemists/components/AgrochemistsTable'
import { CertificateModal } from '@/features/agrochemists/components/CertificateModal'
import { VerificationKpis } from '@/features/agrochemists/components/VerificationKpis'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { Agrochemist, VerificationStatus } from '@/shared/types'

export function AgrochemistsPage() {
  const [status, setStatus] = useState<VerificationStatus>('pending')
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<Agrochemist>()
  const { data: stats } = useApiQuery(() => api.getVerificationStats(), [])
  const { data: agrochemists } = useApiQuery(
    () => api.getAgrochemists({ status, search }),
    [status, search],
  )

  return (
    <>
      <PageHeader
        title="Верификация агрохимиков"
        subtitle="Проверьте документы перед публикацией профиля"
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
      <div className="flex flex-col gap-4">
        <VerificationKpis stats={stats} status={status} onStatusChange={setStatus} />
        {agrochemists ? (
          <AgrochemistsTable
            agrochemists={agrochemists}
            onOpenDocuments={setViewing}
            empty={search ? 'Никого не нашли по этому имени' : 'Заявок нет'}
          />
        ) : (
          <Loader />
        )}
      </div>
      <CertificateModal agrochemist={viewing} onClose={() => setViewing(undefined)} />
    </>
  )
}
