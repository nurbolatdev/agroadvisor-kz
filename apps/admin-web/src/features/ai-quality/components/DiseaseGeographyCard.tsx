import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { districtLevel, LEVELS, outbreakLevel } from '@/features/ai-quality/outbreaks'
import type { DiseaseGeography } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatNumber } from '@/shared/utils/format'

interface DiseaseGeographyCardProps {
  geography: DiseaseGeography
}

/** Simplified 2 × 2 scheme of districts, not a geographic map. */
const SHAPES: Record<string, { points: string; label: [number, number]; short?: string }> = {
  karasay: { points: '10,20 130,14 138,110 16,118', label: [72, 66] },
  talgar: { points: '130,14 250,22 244,104 138,110', label: [190, 62] },
  ili: { points: '16,118 138,110 142,208 20,204', label: [78, 162] },
  enbekshikazakh: {
    points: '138,110 244,104 250,200 142,208',
    label: [194, 158],
    short: 'Енбекшиказах.',
  },
}

export function DiseaseGeographyCard({ geography }: DiseaseGeographyCardProps) {
  const { t } = useTranslation('aiQuality', { keyPrefix: 'geography' })
  const [activeDistrict, setActiveDistrict] = useState<string>()
  const { outbreaks, districts } = geography
  const alerts = outbreaks.filter((outbreak) => outbreakLevel(outbreak) !== 'calm').length
  const districtName = (id: string) => districts.find((district) => district.id === id)?.name ?? id

  return (
    <Card>
      <CardHeader
        title={t('title')}
        subtitle={`${geography.region} · ${t('days', { count: geography.days })}`}
        action={alerts > 0 ? <Badge tone="danger">{t('alerts', { count: alerts })}</Badge> : null}
      />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <svg
          viewBox="0 0 260 220"
          role="group"
          aria-label={t('scheme')}
          className="w-full rounded-xl bg-bg"
        >
          {districts.map((district) => {
            const shape = SHAPES[district.id]
            if (!shape) return null
            const level = districtLevel(outbreaks, district.id)
            const isActive = activeDistrict === district.id
            return (
              <g
                key={district.id}
                // Focus or hover highlights the district's rows; a tap does the same on touch screens.
                role="img"
                tabIndex={0}
                aria-label={t('districtLevel', {
                  district: district.name,
                  level: t(`levels.${level}`),
                })}
                onMouseEnter={() => setActiveDistrict(district.id)}
                onMouseLeave={() => setActiveDistrict(undefined)}
                onFocus={() => setActiveDistrict(district.id)}
                onBlur={() => setActiveDistrict(undefined)}
                onClick={() => setActiveDistrict(isActive ? undefined : district.id)}
                className="cursor-pointer outline-none"
              >
                <polygon
                  points={shape.points}
                  strokeWidth={isActive ? 3 : 1.5}
                  className={cn('transition-[stroke-width]', LEVELS[level].shape)}
                />
                <text
                  x={shape.label[0]}
                  y={shape.label[1]}
                  textAnchor="middle"
                  className="text-[11px] font-semibold"
                >
                  {shape.short ?? district.name}
                </text>
              </g>
            )
          })}
        </svg>

        <div>
          <h3 className="mb-1 text-caption font-normal text-text-muted">{t('active')}</h3>
          <ul>
            {outbreaks.map((outbreak) => {
              const level = LEVELS[outbreakLevel(outbreak)]
              const isActive = activeDistrict === outbreak.districtId
              return (
                <li
                  key={`${outbreak.districtId}-${outbreak.disease}`}
                  onMouseEnter={() => setActiveDistrict(outbreak.districtId)}
                  onMouseLeave={() => setActiveDistrict(undefined)}
                  className={cn(
                    '-mx-2 rounded-lg border-b border-border px-2 py-2.5 transition-colors last:border-b-0',
                    isActive && 'bg-primary-soft',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-small font-semibold text-text">{outbreak.disease}</span>
                    <Badge tone={level.tone}>{t('cases', { count: outbreak.cases })}</Badge>
                  </span>
                  <span className="text-caption font-normal text-text-muted">
                    {t('district', { district: districtName(outbreak.districtId) })} ·{' '}
                    {outbreak.growth === null
                      ? t('noGrowth')
                      : t('growth', { value: formatNumber(outbreak.growth) })}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Card>
  )
}
