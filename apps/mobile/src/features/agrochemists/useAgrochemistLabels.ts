import { useTranslation } from 'react-i18next'

import type { AgrochemistCard } from '@/api/agrochemistDirectory'
import { SPECIALIZATIONS, type Specialization } from '@/features/agrochemist/application'
import { isCrop } from '@/features/diagnosis/crops'

function isSpecialization(code: string): code is Specialization {
  return (SPECIALIZATIONS as readonly string[]).includes(code)
}

// The words of a card in the language of the app. A code the app does not know yet is shown as it is.
export function useAgrochemistLabels() {
  const { t } = useTranslation()

  const specialization = (code: string) =>
    isSpecialization(code) ? t(`register.qualification.specializations.${code}`) : code
  const crop = (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)

  return {
    specialization,
    crop,
    // "Защита растений, Агрохимия · 12 лет": the second line of a card
    summary: (item: AgrochemistCard) =>
      [
        item.specializations.map(specialization).join(', '),
        item.experienceYears == null
          ? ''
          : t('agrochemist.profile.years', { count: item.experienceYears }),
      ]
        .filter(Boolean)
        .join(' · '),
  }
}
