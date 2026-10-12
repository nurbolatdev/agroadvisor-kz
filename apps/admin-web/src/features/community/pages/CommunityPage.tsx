import { Users } from 'lucide-react'
import { SectionPlaceholder } from '@/pages/SectionPlaceholder'

export function CommunityPage() {
  return (
    <SectionPlaceholder
      title="Сообщество"
      subtitle="Активность фермеров и агрохимиков в ленте"
      icon={Users}
      description="Здесь появятся вопросы и ответы по неделям, самые активные участники, вопросы без ответа дольше 24 часов и консультации."
    />
  )
}
