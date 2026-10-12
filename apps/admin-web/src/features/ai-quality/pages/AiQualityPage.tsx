import { Cpu } from 'lucide-react'
import { SectionPlaceholder } from '@/pages/SectionPlaceholder'

export function AiQualityPage() {
  return (
    <SectionPlaceholder
      title="Качество ИИ и география"
      subtitle="Качество модели на реальных данных и распространение болезней по районам"
      icon={Cpu}
      description="Здесь появятся уверенность модели, топ болезней, данные для дообучения, расхождения ИИ и экспертов и карта вспышек по районам."
    />
  )
}
