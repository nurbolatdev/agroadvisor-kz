import { FileText, Trash2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { DocumentView } from '@/api/agrochemist'
import { AppText } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { fileSize, formatNumber } from '../fileSize'
import { shortDate } from './format'

type Props = {
  documents: readonly DocumentView[]
  // false for an approved profile: its documents are locked (the backend answers 409 to a removal)
  canRemove: boolean
  // a removal is on its way: the buttons are off
  busy: boolean
  onRemove: (document: DocumentView) => void
}

// The documents sent with the application: the kind, the size and the day, and a button that removes one.
// The removal is asked about by the screen (a confirmation), not here.
export function DocumentList({ documents, canRemove, busy, onRemove }: Props) {
  const { t, i18n } = useTranslation()

  return (
    <View style={styles.list}>
      {documents.map((document) => {
        const { unit, value } = fileSize(document.sizeBytes)
        const size = t(
          unit === 'mb' ? 'register.qualification.sizeMb' : 'register.qualification.sizeKb',
          {
            value: formatNumber(value, i18n.language),
          },
        )
        const kind = t(`agrochemist.documents.kinds.${document.kind}`)
        return (
          <View key={document.id} style={styles.row}>
            <FileText size={sizes.icon} color={colors.primary} />
            <View style={styles.texts}>
              <AppText variant="body">{kind}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {`${size} · ${shortDate(document.uploadedAt, i18n.language)}`}
              </AppText>
            </View>
            {canRemove ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('agrochemist.documents.remove')}. ${kind}`}
                accessibilityState={{ disabled: busy }}
                hitSlop={spacing.sm}
                onPress={() => !busy && onRemove(document)}
                style={styles.remove}
              >
                <Trash2 size={sizes.icon} color={busy ? colors.border : colors.danger} />
              </Pressable>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  texts: { flex: 1 },
  remove: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
