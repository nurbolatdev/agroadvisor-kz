import { Settings } from 'lucide-react'
import { SectionPlaceholder } from '@/pages/SectionPlaceholder'

export function SettingsPage() {
  return (
    <SectionPlaceholder
      title="Настройки"
      subtitle="Профиль администратора и параметры платформы"
      icon={Settings}
      description="Здесь появятся профиль администратора, язык интерфейса по умолчанию и правила модерации."
    />
  )
}
