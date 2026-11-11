import { CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export interface LoadErrorProps {
  onRetry: () => void
}

/** Shown instead of a page's data when its request failed (the backend is down, a timeout, a server error). */
export function LoadError({ onRetry }: LoadErrorProps) {
  const { t } = useTranslation('common')
  return (
    <EmptyState
      icon={CloudOff}
      title={t('states.loadError')}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      }
    />
  )
}
