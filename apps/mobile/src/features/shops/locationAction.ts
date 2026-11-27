import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'

type Permission = 'granted' | 'denied' | 'blocked'

// The button that follows why there is no GPS point: the system will not ask again (open the settings), the
// position did not come though the permission is given (try again), or the farmer has not allowed it yet.
export function useLocationAction(
  permission: Permission,
  actions: { reload: () => void; askPermission: () => void },
  allowKey: 'shops.allowLocation' | 'shops.noLocation.allow',
): { label: string; onPress: () => void } {
  const { t } = useTranslation()
  if (permission === 'blocked') {
    return { label: t('shops.noLocation.openSettings'), onPress: () => void Linking.openSettings() }
  }
  if (permission === 'granted') return { label: t('common.retry'), onPress: actions.reload }
  return { label: t(allowKey), onPress: actions.askPermission }
}
