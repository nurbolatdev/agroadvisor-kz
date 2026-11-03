import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { Redirect, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AppText, Button, Screen } from '@/components/ui'
import type { PickedPhoto } from '@/features/diagnosis/photo'
import { useDiagnosis } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

// Screen 08, step 2: the camera with a frame, or a photo from the gallery.
export default function CameraScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const crop = useDiagnosis((s) => s.crop)
  const setPhoto = useDiagnosis((s) => s.setPhoto)
  const [permission, requestPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // The crop is chosen first; coming here without it (a restored screen) goes back.
  if (crop === null) return <Redirect href="/diagnosis" />

  const analyze = (photo: PickedPhoto) => {
    setPhoto(photo)
    router.replace('/diagnosis/analysis')
  }

  const shoot = async () => {
    if (busy || !camera.current) return
    setBusy(true)
    setMessage(null)
    try {
      const picture = await camera.current.takePictureAsync({ exif: false })
      analyze({ uri: picture.uri, width: picture.width, height: picture.height })
    } catch {
      setMessage(t('diagnosis.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const pickFromGallery = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        exif: false,
        quality: 1,
      })
      if (!picked.canceled) {
        const asset = picked.assets[0]
        analyze({ uri: asset.uri, width: asset.width, height: asset.height })
      }
    } catch {
      setMessage(t('diagnosis.camera.galleryDenied'))
    } finally {
      setBusy(false)
    }
  }

  if (permission === null) return <Screen>{null}</Screen>

  if (!permission.granted) {
    return (
      <Screen scroll>
        <AppText variant="h1" color={colors.primaryDark}>
          {t('diagnosis.camera.permissionTitle')}
        </AppText>
        <AppText color={colors.textMuted} style={styles.gap}>
          {t('diagnosis.camera.permissionText')}
        </AppText>
        <View style={styles.actions}>
          {permission.canAskAgain ? (
            <Button label={t('diagnosis.camera.allow')} onPress={() => void requestPermission()} />
          ) : (
            <Button
              label={t('diagnosis.camera.openSettings')}
              onPress={() => void Linking.openSettings()}
            />
          )}
          <Button
            label={t('diagnosis.camera.gallery')}
            variant="secondary"
            loading={busy}
            onPress={() => void pickFromGallery()}
          />
        </View>
        {message ? (
          <AppText color={colors.danger} style={styles.gap}>
            {message}
          </AppText>
        ) : null}
      </Screen>
    )
  }

  return (
    <View style={styles.full}>
      <CameraView ref={camera} facing="back" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame} />
      </View>
      <View style={[styles.top, { paddingTop: insets.top + spacing.lg }]}>
        <AppText variant="h2" color={colors.white}>
          {t('diagnosis.camera.title')}
        </AppText>
        <AppText variant="small" color={colors.white}>
          {t('diagnosis.camera.hint')}
        </AppText>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        {message ? (
          <AppText color={colors.white} style={styles.message}>
            {message}
          </AppText>
        ) : null}
        <Button label={t('diagnosis.camera.shoot')} loading={busy} onPress={() => void shoot()} />
        <Button
          label={t('diagnosis.camera.gallery')}
          variant="secondary"
          disabled={busy}
          onPress={() => void pickFromGallery()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: colors.primaryDark },
  gap: { marginTop: spacing.sm },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '78%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: radii.lg,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  message: { textAlign: 'center' },
})
