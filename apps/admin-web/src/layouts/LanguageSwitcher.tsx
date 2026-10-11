import { useState } from 'react'

const LANGUAGES = [
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'kk', label: 'KK', name: 'Қазақша' },
  { code: 'en', label: 'EN', name: 'English' },
] as const

type Language = (typeof LANGUAGES)[number]['code']

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<Language>('ru')

  return (
    <div
      role="group"
      aria-label="Язык интерфейса"
      className="flex h-9 rounded-[10px] border border-border bg-white p-1"
    >
      {LANGUAGES.map(({ code, label, name }) => (
        <button
          key={code}
          type="button"
          title={name}
          aria-pressed={language === code}
          onClick={() => setLanguage(code)}
          className={`flex-1 rounded-lg text-[13px] font-medium transition-colors ${
            language === code ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
