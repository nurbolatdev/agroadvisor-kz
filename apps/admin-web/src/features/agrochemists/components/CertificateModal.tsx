import { Award, GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import type { Agrochemist } from '@/shared/types'
import { pluralize } from '@/shared/utils/format'

interface CertificateModalProps {
  agrochemist: Agrochemist | undefined
  onClose: () => void
  /** Decision buttons for pending applications. */
  footer?: ReactNode
}

const DOCUMENT_ICONS = { diploma: GraduationCap, certificate: Award }

export function CertificateModal({ agrochemist, onClose, footer }: CertificateModalProps) {
  return (
    <Modal
      open={agrochemist !== undefined}
      onClose={onClose}
      title="Документы специалиста"
      footer={footer}
    >
      {agrochemist ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={agrochemist.name} size="md" />
            <div>
              <p className="font-semibold text-text">{agrochemist.name}</p>
              <p className="text-caption font-normal text-text-muted">
                {agrochemist.specialization} · {agrochemist.region} ·{' '}
                {pluralize(agrochemist.experienceYears, ['год', 'года', 'лет'])} опыта
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {agrochemist.documents.map((document) => {
              const Icon = DOCUMENT_ICONS[document.kind]
              return (
                <li
                  key={document.fileUrl}
                  className="flex gap-3 rounded-xl border border-border bg-white p-3"
                >
                  <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-text">{document.title}</p>
                    <p className="text-caption font-normal text-text-muted">
                      {document.issuer} · {document.year}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-caption font-normal text-text-muted">
            Сканы документов появятся после подключения файлового хранилища.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}
