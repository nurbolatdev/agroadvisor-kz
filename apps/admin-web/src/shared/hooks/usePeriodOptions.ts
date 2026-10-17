import { useTranslation } from 'react-i18next'
import { PERIODS } from '@/shared/constants/periods'

/** Options of the "7 дней · 30 дней · Сезон" switcher in the current language. */
export function usePeriodOptions() {
  const { t } = useTranslation()
  return PERIODS.map((value) => ({ value, label: t(`periods.${value}`) }))
}
