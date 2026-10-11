import { useState } from 'react'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl'

type Language = 'ru' | 'kk' | 'en'

const LANGUAGES: SegmentedOption<Language>[] = [
  { value: 'ru', label: 'RU', title: 'Русский' },
  { value: 'kk', label: 'KK', title: 'Қазақша' },
  { value: 'en', label: 'EN', title: 'English' },
]

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<Language>('ru')

  return (
    <SegmentedControl
      label="Язык интерфейса"
      options={LANGUAGES}
      value={language}
      onChange={setLanguage}
      fullWidth
    />
  )
}
