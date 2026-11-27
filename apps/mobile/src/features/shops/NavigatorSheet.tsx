import { ExternalLink } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Shop } from '@/api/shops'
import { AppText, Button, Checkbox } from '@/components/ui'
import { storage } from '@/lib/storage'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { BottomSheetModal } from './BottomSheetModal'
import { distanceLabel } from './helpers'
import { NAVIGATORS, openRoute, rememberNavigator } from './navigator'
import type { Navigator } from './navigator'

// The mark on the tile of every navigator (frame 18b): the brand colour and a letter; Google is white
const TILES: Record<Navigator, { background: string; mark: string; markColor: string }> = {
  '2gis': { background: colors.brand2gis, mark: '2GIS', markColor: colors.white },
  yandex: { background: colors.brandYandex, mark: 'Я', markColor: colors.white },
  google: { background: colors.white, mark: 'G', markColor: colors.text },
}

type Props = {
  shop: Shop
  onClose: () => void
}

// The choice of the navigator for the route to a shop (screen 18b). A tap opens the route; the choice is
// remembered only after the route was really opened. The routing itself is done by the navigator app.
export function NavigatorSheet({ shop, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [remember, setRemember] = useState(false)
  const [failed, setFailed] = useState(false)
  const [opening, setOpening] = useState(false)

  const subtitle =
    shop.distanceM === undefined
      ? shop.name
      : `${shop.name} · ${distanceLabel(shop.distanceM, i18n.language)}`

  const choose = async (app: Navigator) => {
    if (opening) return
    setFailed(false)
    setOpening(true)
    const opened = await openRoute(app, shop)
    setOpening(false)
    if (!opened) {
      setFailed(true)
      return
    }
    if (remember) rememberNavigator(storage, app)
    onClose()
  }

  return (
    <BottomSheetModal onClose={onClose}>
      <View>
        <AppText variant="h2">{t('shops.navigator.title')}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {subtitle}
        </AppText>
      </View>
      <View style={styles.list}>
        {NAVIGATORS.map((app, index) => (
          <Pressable
            key={app}
            accessibilityRole="button"
            accessibilityLabel={t(`shops.navigator.apps.${app}`)}
            onPress={() => void choose(app)}
            style={[styles.row, index > 0 && styles.rowBorder]}
          >
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={[
                styles.tile,
                { backgroundColor: TILES[app].background },
                app === 'google' && styles.tileOutlined,
              ]}
            >
              <AppText variant={app === '2gis' ? 'caption' : 'h2'} color={TILES[app].markColor}>
                {TILES[app].mark}
              </AppText>
            </View>
            <AppText style={styles.name}>{t(`shops.navigator.apps.${app}`)}</AppText>
            <ExternalLink size={sizes.icon} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
      {failed ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {t('shops.navigator.failed')}
        </AppText>
      ) : null}
      <Checkbox checked={remember} onChange={setRemember} label={t('shops.navigator.remember')} />
      <Button variant="ghost" label={t('shops.navigator.cancel')} onPress={onClose} />
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    padding: spacing.md,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  tile: {
    width: sizes.avatarSm,
    height: sizes.avatarSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  tileOutlined: { borderWidth: 1, borderColor: colors.border },
  name: { flex: 1 },
})
