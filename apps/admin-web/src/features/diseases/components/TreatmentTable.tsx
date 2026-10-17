import { useTranslation } from 'react-i18next'
import type { Treatment } from '@/shared/types'

interface TreatmentTableProps {
  treatments: Treatment[]
}

export function TreatmentTable({ treatments }: TreatmentTableProps) {
  const { t } = useTranslation('diseases', { keyPrefix: 'treatments' })
  return (
    <table className="w-full text-left text-small">
      <thead className="text-text-muted">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            {t('product')}
          </th>
          <th scope="col" className="pb-2 font-medium">
            {t('ingredient')}
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            {t('dosage')}
          </th>
        </tr>
      </thead>
      <tbody>
        {treatments.map((treatment) => (
          <tr key={treatment.name} className="border-t border-border">
            <td className="py-2.5 pr-3 font-semibold text-text">{treatment.name}</td>
            <td className="py-2.5 pr-3 text-text">{treatment.activeIngredient ?? '—'}</td>
            <td className="py-2.5 text-right text-text-muted">{treatment.dosage}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
