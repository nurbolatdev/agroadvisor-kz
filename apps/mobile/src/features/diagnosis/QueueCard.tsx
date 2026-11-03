import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Badge, type BadgeTone, Button, GlassCard } from '@/components/ui'
import { colors, spacing } from '@/theme/tokens'

import { isCrop } from './crops'
import type { QueueRow, QueueStatus } from './queueView'
import { useCountdown } from './timers'

const TONE: Record<QueueStatus, BadgeTone> = {
  waiting: 'info',
  sending: 'info',
  error: 'danger',
  photoLost: 'danger',
}

type Props = {
  row: QueueRow
  onRetry: () => void
  onDiscard: () => void
  onNewPhoto: () => void
}

// One entry of the queue. After a failure the server may ask to wait (Retry-After): "Retry" is off until then.
export function QueueCard({ row, onRetry, onDiscard, onNewPhoto }: Props) {
  const { t } = useTranslation()
  const wait = useCountdown(row.failure?.retryAfterSeconds, row.failure)
  const crop = row.pending.crop

  return (
    <GlassCard style={styles.card}>
      <Badge label={t(`diagnosis.queue.status.${row.status}`)} tone={TONE[row.status]} />
      <AppText variant="h2">{isCrop(crop) ? t(`diagnosis.crops.${crop}`) : crop}</AppText>
      <AppText variant="small" color={colors.textMuted}>
        {new Date(row.pending.createdAt).toLocaleString()}
      </AppText>
      {row.messageKey ? <AppText color={colors.danger}>{t(row.messageKey)}</AppText> : null}
      {row.status === 'photoLost' ? (
        <AppText color={colors.danger}>{t('diagnosis.errors.photoLost')}</AppText>
      ) : null}
      {wait > 0 ? (
        <AppText variant="small" color={colors.textMuted}>
          {t('diagnosis.analysis.retryIn', { seconds: wait })}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        {row.actions.includes('retry') ? (
          <Button label={t('diagnosis.queue.retry')} disabled={wait > 0} onPress={onRetry} />
        ) : null}
        {row.actions.includes('newPhoto') ? (
          <Button label={t('diagnosis.queue.newPhoto')} onPress={onNewPhoto} />
        ) : null}
        {row.actions.includes('discard') ? (
          <Button label={t('diagnosis.queue.discard')} variant="secondary" onPress={onDiscard} />
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
  )
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
})
