import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import type { FeedStatus } from '@/api/community'
import { Chip } from '@/components/ui'
import type { Crop } from '@/features/diagnosis/crops'
import { spacing } from '@/theme/tokens'

import type { FeedFilters as Filters } from './helpers'

// the order of the crop chips in the design (screen 24)
const FEED_CROPS: readonly Crop[] = ['wheat', 'tomato', 'potato', 'corn']
const STATUSES: readonly FeedStatus[] = ['open', 'solved', 'unanswered']

type Props = {
  filters: Filters
  // the name of the region of the profile; null when there is no region, then there is no chip for it
  regionName: string | null
  // the caller follows no crops yet: "My crops" opens the list of them instead of filtering
  noSubscriptions: boolean
  onChange: (filters: Filters) => void
  onOpenCrops: () => void
}

// The two rows of chips over the feed (screens 24, 24a). The first picks the crop (one at a time, a second
// touch clears it); the second the region and the status of the question, and the switch "My questions".
export function FeedFilters({
  filters,
  regionName,
  noSubscriptions,
  onChange,
  onOpenCrops,
}: Props) {
  const { t } = useTranslation()

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.content}
      >
        <Chip
          label={t('community.filters.mine')}
          selected={filters.crop === 'mine'}
          onPress={() => {
            if (noSubscriptions) onOpenCrops()
            else onChange({ ...filters, crop: filters.crop === 'mine' ? null : 'mine' })
          }}
        />
        {FEED_CROPS.map((crop) => (
          <Chip
            key={crop}
            label={t(`diagnosis.crops.${crop}`)}
            selected={filters.crop === crop}
            onPress={() => onChange({ ...filters, crop: filters.crop === crop ? null : crop })}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.content}
      >
        {regionName ? (
          <Chip
            label={regionName}
            selected={filters.region}
            onPress={() => onChange({ ...filters, region: !filters.region })}
          />
        ) : null}
        {STATUSES.map((status) => (
          <Chip
            key={status}
            label={t(`community.filters.${status}`)}
            selected={filters.status === status}
            onPress={() =>
              onChange({ ...filters, status: filters.status === status ? null : status })
            }
          />
        ))}
        <Chip
          label={t('community.filters.myQuestions')}
          selected={filters.mine}
          onPress={() => onChange({ ...filters, mine: !filters.mine })}
        />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  // the rows run to the edges of the screen, as in the design, and scroll sideways
  row: { flexGrow: 0, marginHorizontal: -spacing.xl },
  content: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
})
