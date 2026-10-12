import { Chip } from '@/components/ui/Chip'
import { CROP_IDS, CROP_LABELS } from '@/shared/constants/crops'
import type { CropId } from '@/shared/types'

interface CropFilterProps {
  value: CropId | undefined
  onChange: (crop: CropId | undefined) => void
}

export function CropFilter({ value, onChange }: CropFilterProps) {
  return (
    <div role="toolbar" aria-label="Культура" className="flex flex-wrap gap-2">
      <Chip selected={value === undefined} onClick={() => onChange(undefined)}>
        Все культуры
      </Chip>
      {CROP_IDS.map((crop) => (
        <Chip key={crop} selected={value === crop} onClick={() => onChange(crop)}>
          {CROP_LABELS[crop]}
        </Chip>
      ))}
    </div>
  )
}
