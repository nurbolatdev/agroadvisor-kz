import { ArrowLeft, FlaskConical, Leaf, SearchX, ShieldCheck, Thermometer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { TreatmentTable } from '@/features/diseases/components/TreatmentTable'
import { DISEASE_KINDS, SEVERITIES } from '@/features/diseases/diseases'
import { api } from '@/services/api'
import { CROP_LABELS } from '@/shared/constants/crops'
import { ROUTES } from '@/shared/constants/routes'
import { useApiQuery } from '@/shared/hooks/useApiQuery'

const BACK_LINK_CLASSES =
  'mb-4 inline-flex items-center gap-1.5 rounded-md text-small font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none'

function BackLink() {
  return (
    <Link to={ROUTES.diseases} className={BACK_LINK_CLASSES}>
      <ArrowLeft size={16} aria-hidden="true" />
      Все болезни
    </Link>
  )
}

export function DiseaseDetailPage() {
  const { id = '' } = useParams()
  const { data: disease, isLoading } = useApiQuery(() => api.getDisease(id), [id])

  if (isLoading && !disease) return <Loader />

  if (!disease) {
    return (
      <>
        <BackLink />
        <Card>
          <EmptyState
            icon={SearchX}
            title="Болезнь не найдена"
            description="Возможно, запись удалили или в адресе опечатка."
          />
        </Card>
      </>
    )
  }

  const severity = SEVERITIES[disease.severity]

  return (
    <>
      <BackLink />
      <PageHeader
        title={disease.name}
        subtitle={<span className="italic">{disease.latinName}</span>}
        actions={
          <span className="flex flex-wrap gap-2">
            <Badge tone="success">{CROP_LABELS[disease.crop]}</Badge>
            <Badge tone="neutral">{DISEASE_KINDS[disease.kind]}</Badge>
            <Badge tone={severity.tone}>{severity.label}</Badge>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Симптомы"
            action={<Leaf size={20} aria-hidden="true" className="text-primary" />}
          />
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-text">
            {disease.symptoms.map((symptom) => (
              <li key={symptom}>{symptom}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="Условия развития"
            action={<Thermometer size={20} aria-hidden="true" className="text-primary" />}
          />
          <p className="text-body text-text">{disease.conditions}</p>
        </Card>
        <Card>
          <CardHeader
            title="Химическая защита"
            subtitle="Нормы демонстрационные — сверяйтесь с инструкцией препарата"
            action={<FlaskConical size={20} aria-hidden="true" className="text-primary" />}
          />
          <TreatmentTable treatments={disease.chemicalTreatment} />
        </Card>
        <Card>
          <CardHeader
            title="Биологическая защита"
            action={<Leaf size={20} aria-hidden="true" className="text-primary" />}
          />
          <TreatmentTable treatments={disease.biologicalTreatment} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            title="Профилактика"
            action={<ShieldCheck size={20} aria-hidden="true" className="text-primary" />}
          />
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-text">
            {disease.prevention.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
