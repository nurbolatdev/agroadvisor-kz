import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { colors, spacing } from '@/theme/tokens'

import { AppText } from './AppText'
import { Button } from './Button'

type BaseProps = {
  icon: LucideIcon
  iconColor: string
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}

function StateView({ icon: Icon, iconColor, title, message, actionLabel, onAction }: BaseProps) {
  return (
    <View style={styles.container}>
      <Icon size={48} color={iconColor} />
      <AppText variant="h2" style={styles.center}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color={colors.textMuted} style={styles.center}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" compact />
      ) : null}
    </View>
  )
}

type EmptyProps = { title?: string; message?: string; actionLabel?: string; onAction?: () => void }

export function EmptyState({ title, message, actionLabel, onAction }: EmptyProps) {
  const { t } = useTranslation()
  return (
    <StateView
      icon={Inbox}
      iconColor={colors.textMuted}
      title={title ?? t('common.empty')}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  )
}

type ErrorProps = { title?: string; message?: string; onRetry?: () => void }

export function ErrorState({ title, message, onRetry }: ErrorProps) {
  const { t } = useTranslation()
  return (
    <StateView
      icon={CircleAlert}
      iconColor={colors.danger}
      title={title ?? t('common.error')}
      message={message}
      actionLabel={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
    />
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  center: { textAlign: 'center' },
})
