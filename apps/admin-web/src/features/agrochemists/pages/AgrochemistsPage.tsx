import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchBar } from '@/components/ui/SearchBar'
import { AgrochemistsTable } from '@/features/agrochemists/components/AgrochemistsTable'
import { CertificateModal } from '@/features/agrochemists/components/CertificateModal'
import { DecisionCell } from '@/features/agrochemists/components/DecisionCell'
import { RejectModal } from '@/features/agrochemists/components/RejectModal'
import { VerificationKpis } from '@/features/agrochemists/components/VerificationKpis'
import { useVerificationDecisions } from '@/features/agrochemists/useVerificationDecisions'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import type { Agrochemist, VerificationStatus } from '@/shared/types'

export function AgrochemistsPage() {
  const [status, setStatus] = useState<VerificationStatus>('pending')
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<Agrochemist>()
  const [rejecting, setRejecting] = useState<Agrochemist>()
  const stats = useApiQuery(() => api.getVerificationStats(), [])
  const list = useApiQuery(() => api.getAgrochemists({ status, search }), [status, search])
  const decisions = useVerificationDecisions(() => {
    list.reload()
    stats.reload()
  })

  const approve = async (agrochemist: Agrochemist) => {
    if (await decisions.approve(agrochemist)) setViewing(undefined)
  }
  const startReject = (agrochemist: Agrochemist) => {
    setViewing(undefined)
    setRejecting(agrochemist)
  }

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
        <VerificationKpis stats={stats.data} status={status} onStatusChange={setStatus} />
        {decisions.error ? (
          <p role="alert" className="text-small text-danger">
            {decisions.error}
          </p>
        ) : null}
        {list.data ? (
          <AgrochemistsTable
            agrochemists={list.data}
            onOpenDocuments={setViewing}
            empty={search ? 'Никого не нашли по этому имени' : 'Заявок нет'}
            extraColumns={[
              {
                key: 'decision',
                header: '',
                align: 'right',
                render: (row) => (
                  <DecisionCell
                    agrochemist={row}
                    busy={decisions.busyId === row.id}
                    onApprove={() => approve(row)}
                    onReject={() => startReject(row)}
                    onRequestDocuments={() => decisions.requestDocuments(row)}
                  />
                ),
              },
            ]}
          />
        ) : (
          <Loader />
        )}
      </div>

      <CertificateModal
        agrochemist={viewing}
        onClose={() => setViewing(undefined)}
        footer={
          viewing?.status === 'pending' ? (
            <>
              <Button size="sm" variant="secondary" icon={X} onClick={() => startReject(viewing)}>
                Отклонить
              </Button>
              <Button
                size="sm"
                icon={Check}
                disabled={decisions.busyId === viewing.id}
                onClick={() => approve(viewing)}
              >
                Подтвердить
              </Button>
            </>
          ) : undefined
        }
      />
      <RejectModal
        key={rejecting?.id}
        agrochemist={rejecting}
        onClose={() => setRejecting(undefined)}
        onConfirm={(reason) => {
          if (rejecting) decisions.reject(rejecting, reason)
          setRejecting(undefined)
        }}
      />
    </>
  )
}
