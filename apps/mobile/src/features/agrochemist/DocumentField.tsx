import { FileText, Upload, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText, Button } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { chooseDocument, type ChosenDocument, type DocumentSource } from './chooseDocument'
import { PROBLEM_PARAMS } from './documentRules'
import { problemKey, type UploadProblem } from './errors'
import { fileSize, formatNumber } from './fileSize'

type Props = {
  document: ChosenDocument | null
  onChange: (document: ChosenDocument | null) => void
  // a send is on its way: the document cannot be changed
  disabled?: boolean
  // told under the field by the screen (for example "Upload a diploma")
  error?: string
}

// The dashed zone of frame 03a with the file under it: tap the zone, pick the source (camera, gallery or a
// file; three buttons, because an Android Alert holds three at most), see the file with its size, remove it.
// A file the phone refuses is explained here, in the words of the problem list.
export function DocumentField({ document, onChange, disabled = false, error }: Props) {
  const { t, i18n } = useTranslation()
  const [choosing, setChoosing] = useState(false)
  const [problem, setProblem] = useState<UploadProblem | null>(null)

  const pick = async (source: DocumentSource) => {
    setChoosing(false)
    const result = await chooseDocument(source)
    if (result.status === 'chosen') {
      setProblem(null)
      onChange(result.document)
    } else if (result.status === 'refused') {
      setProblem(result.problem)
    }
  }

  const sizeText = (bytes: number | null) => {
    if (bytes === null) return null
    const { unit, value } = fileSize(bytes)
    return t(unit === 'mb' ? 'register.qualification.sizeMb' : 'register.qualification.sizeKb', {
      value: formatNumber(value, i18n.language),
    })
  }
  const size = document ? sizeText(document.size) : null

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('register.qualification.upload')}
        accessibilityState={{ disabled }}
        onPress={() => !disabled && setChoosing((open) => !open)}
        style={styles.zone}
      >
        <Upload size={sizes.icon} color={colors.primary} />
        <AppText variant="h2" color={colors.primaryDark}>
          {t('register.qualification.upload')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {t('register.qualification.uploadHint')}
        </AppText>
      </Pressable>

      {choosing ? (
        <View style={styles.sources}>
          <Button
            variant="secondary"
            label={t('agrochemist.documents.takePhoto')}
            onPress={() => void pick('camera')}
          />
          <Button
            variant="secondary"
            label={t('agrochemist.documents.fromGallery')}
            onPress={() => void pick('gallery')}
          />
          <Button
            variant="secondary"
            label={t('agrochemist.documents.addPdf')}
            onPress={() => void pick('file')}
          />
        </View>
      ) : null}

      {problem ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {t(problemKey(problem), PROBLEM_PARAMS)}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      {document ? (
        <View style={styles.file}>
          <FileText size={sizes.icon} color={colors.primary} />
          <View style={styles.fileTexts}>
            <AppText variant="body" numberOfLines={1}>
              {document.name}
            </AppText>
            {size ? (
              <AppText variant="small" color={colors.textMuted}>
                {t('register.qualification.uploaded', { size })}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('register.qualification.removeDocument')}
            accessibilityState={{ disabled }}
            hitSlop={spacing.sm}
            onPress={() => !disabled && onChange(null)}
            style={styles.remove}
          >
            <X size={sizes.icon} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: spacing.md },
  zone: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  center: { textAlign: 'center' },
  sources: { gap: spacing.sm },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  fileTexts: { flex: 1 },
  remove: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
