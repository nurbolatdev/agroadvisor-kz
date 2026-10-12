import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { PERIOD_SUFFIX } from '@/shared/constants/periods'
import { getDiseaseDetailPath } from '@/shared/constants/routes'
import type { StatsPeriod, TopDisease } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface TopDiseasesCardProps {
  diseases: TopDisease[]
  period: StatsPeriod
}

export function TopDiseasesCard({ diseases, period }: TopDiseasesCardProps) {
  const max = Math.max(...diseases.map((disease) => disease.count), 1)

  return (
    <Card>
      <CardHeader title="Топ болезней" subtitle={`число диагнозов ${PERIOD_SUFFIX[period]}`} />
      <ul className="flex flex-col gap-2.5">
        {diseases.map((disease) => {
          const content = (
            <>
              <span className="flex items-baseline justify-between gap-3 text-small">
                <span className="truncate text-text">{disease.name}</span>
                <span className="font-bold text-text">{formatNumber(disease.count)}</span>
              </span>
              <span aria-hidden="true" className="mt-1 block h-2 rounded-full bg-track">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(disease.count / max) * 100}%` }}
                />
              </span>
            </>
          )
          return (
            <li key={disease.name}>
              {disease.diseaseId ? (
                <Link
                  to={getDiseaseDetailPath(disease.diseaseId)}
                  title="Открыть в справочнике"
                  className="block rounded-md hover:[&_span.truncate]:text-primary hover:[&_span.truncate]:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  {content}
                </Link>
              ) : (
                <div>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
