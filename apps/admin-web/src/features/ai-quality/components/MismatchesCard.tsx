import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import type { AiMismatch } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface MismatchesCardProps {
  mismatches: AiMismatch[]
}

export function MismatchesCard({ mismatches }: MismatchesCardProps) {
  const { t } = useTranslation('aiQuality', { keyPrefix: 'mismatches' })
  return (
    <Card>
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-small">
          <thead className="text-caption font-normal text-text-muted">
            <tr>
              <th scope="col" className="pb-2 font-normal">
                {t('aiLabel')}
              </th>
              <th scope="col" className="pb-2 font-normal">
                {t('confirmed')}
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                {t('cases')}
              </th>
            </tr>
          </thead>
          <tbody>
            {mismatches.map((row) => (
              <tr key={`${row.aiLabel}-${row.confirmedLabel}`} className="border-t border-border">
                <td className="py-3 pr-3 text-text">{row.aiLabel}</td>
                <td className="py-3 pr-3 font-semibold text-primary">{row.confirmedLabel}</td>
                <td className="py-3 text-right font-semibold text-text">
                  {formatNumber(row.cases)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
