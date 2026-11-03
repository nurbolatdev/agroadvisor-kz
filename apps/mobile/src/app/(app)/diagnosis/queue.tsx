import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
  AppText,
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  GlassCard,
  Screen,
} from '@/components/ui'
import { isCrop } from '@/features/diagnosis/crops'
import { type QueueRow, type QueueStatus, queueRows } from '@/features/diagnosis/queueView'
import { useDiagnosis } from '@/services'
import { colors, spacing } from '@/theme/tokens'

const TONE: Record<QueueStatus, BadgeTone> = {
  waiting: 'info',
  sending: 'info',
  error: 'danger',
  photoLost: 'danger',
}

// The offline queue: diagnoses that were asked for and have no answer yet. Nothing is sent by itself;
// each entry is sent again, with its own key and its own photo, only when the farmer presses "Retry".
export default function QueueScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const queued = useDiagnosis((s) => s.queued)
  const phase = useDiagnosis((s) => s.phase)
  const pending = useDiagnosis((s) => s.pending)
  const failure = useDiagnosis((s) => s.failure)
  const resend = useDiagnosis((s) => s.resend)
  const discard = useDiagnosis((s) => s.discard)
  const selectCrop = useDiagnosis((s) => s.selectCrop)

  const rows = queueRows(queued, { phase, pending, failure })

  const newPhoto = (row: QueueRow) => {
    discard(row.pending.key)
    selectCrop(row.pending.crop)
    router.push('/diagnosis/camera')
  }

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.queue.title')}
      </AppText>

      {rows.length === 0 ? (
        <EmptyState title={t('diagnosis.queue.empty')} />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <GlassCard key={row.pending.key} style={styles.card}>
              <Badge label={t(`diagnosis.queue.status.${row.status}`)} tone={TONE[row.status]} />
              <AppText variant="h2">
                {isCrop(row.pending.crop)
                  ? t(`diagnosis.crops.${row.pending.crop}`)
                  : row.pending.crop}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {new Date(row.pending.createdAt).toLocaleString()}
              </AppText>
              {row.messageKey ? <AppText color={colors.danger}>{t(row.messageKey)}</AppText> : null}
              {row.status === 'photoLost' ? (
                <AppText color={colors.danger}>{t('diagnosis.errors.photoLost')}</AppText>
              ) : null}
              <View style={styles.actions}>
                {row.actions.includes('retry') ? (
                  <Button
                    label={t('diagnosis.queue.retry')}
                    onPress={() => {
                      void resend(row.pending.key)
                    }}
                  />
                ) : null}
                {row.actions.includes('newPhoto') ? (
                  <Button label={t('diagnosis.queue.newPhoto')} onPress={() => newPhoto(row)} />
                ) : null}
                {row.actions.includes('discard') ? (
                  <Button
                    label={t('diagnosis.queue.discard')}
                    variant="secondary"
                    onPress={() => discard(row.pending.key)}
                  />
                ) : null}
                {row.status === 'sending' ? (
                  <Button
                    label={t('diagnosis.queue.status.sending')}
                    loading
                    disabled
                    onPress={() => undefined}
                  />
                ) : null}
              </View>
            </GlassCard>
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
