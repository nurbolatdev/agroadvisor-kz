import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/Chip'
import { CROP_IDS } from '@/shared/constants/crops'
import type { CropId } from '@/shared/types'

interface CropFilterProps {
  value: CropId | undefined
  onChange: (crop: CropId | undefined) => void
}

export function CropFilter({ value, onChange }: CropFilterProps) {
  const { t } = useTranslation(['diseases', 'common'])
  return (
    <div role="toolbar" aria-label={t('cropFilter')} className="flex flex-wrap gap-2">
      <Chip selected={value === undefined} onClick={() => onChange(undefined)}>
        {t('allCrops')}
      </Chip>
      {CROP_IDS.map((crop) => (
        <Chip key={crop} selected={value === crop} onClick={() => onChange(crop)}>
          {t(`common:crops.${crop}`)}
        </Chip>
      ))}
    </div>
  )
}
