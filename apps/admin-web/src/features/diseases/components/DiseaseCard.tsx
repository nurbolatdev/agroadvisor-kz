import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { SEVERITY_TONES } from '@/features/diseases/diseases'
import { getDiseaseDetailPath } from '@/shared/constants/routes'
import type { Disease } from '@/shared/types'

interface DiseaseCardProps {
  disease: Disease
}

export function DiseaseCard({ disease }: DiseaseCardProps) {
  const { t } = useTranslation(['diseases', 'common'])

  return (
    <Link
      to={getDiseaseDetailPath(disease.id)}
      className="group flex flex-col rounded-2xl border border-border bg-white p-5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
    >
      <span className="mb-3 flex flex-wrap gap-2">
        <Badge tone="success">{t(`common:crops.${disease.crop}`)}</Badge>
        <Badge tone="neutral">{t(`kinds.${disease.kind}`)}</Badge>
      </span>
      <span className="text-h2 text-text">{disease.name}</span>
      <span className="text-small text-text-muted italic">{disease.latinName}</span>
      <span className="mt-3 block flex-1">
        <span className="line-clamp-2 text-small text-text">{disease.symptoms[0]}</span>
      </span>
      <span className="mt-4 flex items-center justify-between">
        <Badge tone={SEVERITY_TONES[disease.severity]}>{t(`severities.${disease.severity}`)}</Badge>
        <span className="flex items-center gap-1 text-small font-semibold text-primary">
          {t('more')}
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </span>
    </Link>
  )
}
