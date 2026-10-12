import { Store } from 'lucide-react'
import { SectionPlaceholder } from '@/pages/SectionPlaceholder'

export function ShopsPage() {
  return (
    <SectionPlaceholder
      title="Агромагазины"
      subtitle="Магазины, к которым фермеры строят маршрут в 2GIS и Yandex Maps"
      icon={Store}
      description="Здесь появится справочник агромагазинов: адреса, часы работы и препараты в наличии."
    />
  )
}
