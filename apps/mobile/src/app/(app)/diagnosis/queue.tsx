import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Badge, Button, EmptyState, GlassCard, Screen } from '@/components/ui'
import { type Crop, isCrop } from '@/features/diagnosis/crops'
import { QueueCard } from '@/features/diagnosis/QueueCard'
import { queueRows } from '@/features/diagnosis/queueView'
import { useDiagnosis } from '@/services'
import type { RejectedEntry } from '@/store/diagnosis'
import { colors, spacing } from '@/theme/tokens'

function useCropName() {
  const { t } = useTranslation()
  return (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)
}

// The offline queue: diagnoses that were asked for and have no answer yet. Nothing is sent by itself;
// each entry is sent again, with its own key and its own photo, only when the farmer presses "Retry".
export default function QueueScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const cropName = useCropName()
  const queued = useDiagnosis((s) => s.queued)
  const rejected = useDiagnosis((s) => s.rejected)
  const sendingKeys = useDiagnosis((s) => s.sendingKeys)
  const phase = useDiagnosis((s) => s.phase)
  const pending = useDiagnosis((s) => s.pending)
  const failure = useDiagnosis((s) => s.failure)
  const resend = useDiagnosis((s) => s.resend)
  const discard = useDiagnosis((s) => s.discard)
  const dismissRejected = useDiagnosis((s) => s.dismissRejected)
  const selectCrop = useDiagnosis((s) => s.selectCrop)

  const rows = queueRows(queued, { sendingKeys, phase, pending, failure })

  const newPhoto = (crop: Crop, leave: () => void) => {
    leave()
    selectCrop(crop)
    router.push('/diagnosis/camera')
  }

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.queue.title')}
      </AppText>

      {rows.length === 0 && rejected.length === 0 ? (
        <EmptyState title={t('diagnosis.queue.empty')} />
      ) : (
        <View style={styles.list}>
          {/* refused for good while sending from here: the reason stays until the farmer dismisses it */}
          {rejected.map((note: RejectedEntry) => (
            <GlassCard key={note.key} style={styles.card}>
              <Badge label={t('diagnosis.queue.status.rejected')} tone="danger" />
              <AppText variant="h2">{cropName(note.crop)}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {new Date(note.createdAt).toLocaleString()}
              </AppText>
              <AppText color={colors.danger}>{t(note.failure.messageKey)}</AppText>
              <View style={styles.actions}>
                <Button
                  label={t('diagnosis.queue.newPhoto')}
                  onPress={() => newPhoto(note.crop, () => dismissRejected(note.key))}
                />
                <Button
                  label={t('diagnosis.queue.dismiss')}
                  variant="secondary"
                  onPress={() => dismissRejected(note.key)}
                />
              </View>
            </GlassCard>
          ))}

          {rows.map((row) => (
            <QueueCard
              key={row.pending.key}
              row={row}
              onRetry={() => {
                void resend(row.pending.key)
              }}
              onDiscard={() => discard(row.pending.key)}
              onNewPhoto={() => newPhoto(row.pending.crop, () => discard(row.pending.key))}
            />
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.xl, gap: spacing.lg },
  card: { padding: spacing.lg, gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
})
