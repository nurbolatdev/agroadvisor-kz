import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'

import { FIELD_NAME_MAX, type AreaUnit, type Field } from '@/api/fields'
import {
  AppText,
  BackHeader,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Screen,
} from '@/components/ui'
import { CROPS, isCrop } from '@/features/diagnosis/crops'
import { fieldsApi } from '@/services'
import { colors, spacing } from '@/theme/tokens'

import { areaToText, fieldProblemOf, formatArea, parseArea, type FieldProblem } from './helpers'

const UNITS: AreaUnit[] = ['ha', 'sotka']

// The new field (screen 07) and the field being edited (the same form with the field in it): the name, the
// crop, the area in hectares or sotkas. The frame also has the soil type and the place on a map; the server
// has no soil type, and the map needs a library the app does not have yet, so a field has no point for now.
export function NewFieldScreen() {
  return <FieldForm />
}

export function EditFieldScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; field: Field }
    | { status: 'error'; reason: 'offline' | 'notFound' | 'server' }
  >({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fieldsApi.get(id).then(
      (field) => !cancelled && setState({ status: 'ready', field }),
      (error: unknown) => {
        if (cancelled) return
        const problem = fieldProblemOf(error)
        setState({
          status: 'error',
          reason:
            problem === 'notFound' ? 'notFound' : problem === 'offline' ? 'offline' : 'server',
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (state.status === 'loading') {
    return (
      <Screen>
        <BackHeader backLabel={t('common.back')} onBack={() => router.back()} />
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </Screen>
    )
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <BackHeader backLabel={t('common.back')} onBack={() => router.back()} />
        {state.reason === 'notFound' ? (
          <EmptyState title={t('fields.notFound')} />
        ) : (
          <ErrorState
            message={t(`fields.errors.${state.reason}`)}
            onRetry={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          />
        )}
      </Screen>
    )
  }
  return <FieldForm key={state.field.id} field={state.field} />
}

function FieldForm({ field }: { field?: Field }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState(field?.name ?? '')
  const [crop, setCrop] = useState<string | null>(field?.crop ?? null)
  const [areaText, setAreaText] = useState(field ? areaToText(field.area, i18n.language) : '')
  const [unit, setUnit] = useState<AreaUnit>(field?.areaUnit ?? 'ha')
  const [busy, setBusy] = useState(false)
  // set and read at once, not through a render: two quick presses send one request
  const working = useRef(false)
  const [problem, setProblem] = useState<
    FieldProblem | 'noName' | 'noCrop' | 'noArea' | 'deleteOffline' | 'deleteServer' | null
  >(null)

  const start = () => {
    if (working.current) return false
    working.current = true
    setBusy(true)
    setProblem(null)
    return true
  }
  const finish = () => {
    working.current = false
    setBusy(false)
  }

  const save = async () => {
    if (working.current) return
    const clean = name.trim()
    const area = parseArea(areaText)
    if (clean === '' || clean.length > FIELD_NAME_MAX) return setProblem('noName')
    if (!crop) return setProblem('noCrop')
    if (area === null) return setProblem('noArea')
    if (!start()) return
    try {
      if (field) {
        await fieldsApi.update(field.id, { name: clean, crop, area, areaUnit: unit })
      } else {
        await fieldsApi.create({ name: clean, crop, area, areaUnit: unit })
      }
      router.back()
    } catch (error) {
      setProblem(fieldProblemOf(error))
      finish()
    }
  }

  const remove = () => {
    if (!field) return
    Alert.alert(t('fields.deleteTitle'), t('fields.deleteBody', { name: field.name }), [
      {
        text: t('fields.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!start()) return
          try {
            await fieldsApi.remove(field.id)
            router.back()
          } catch (error) {
            const found = fieldProblemOf(error)
            // the field is gone already: what the person wanted is done
            if (found === 'notFound') return router.back()
            setProblem(found === 'offline' ? 'deleteOffline' : 'deleteServer')
            finish()
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Screen>
        <BackHeader
          title={field ? t('fields.editTitle') : t('fields.newTitle')}
          backLabel={t('common.back')}
          onBack={() => router.back()}
        />
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Input
            label={t('fields.name')}
            value={name}
            onChangeText={(text) => {
              setName(text)
              setProblem(null)
            }}
            maxLength={FIELD_NAME_MAX}
            placeholder={t('fields.namePlaceholder')}
            error={problem === 'noName' ? t('fields.problems.noName') : undefined}
          />

          <View style={styles.group}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('fields.crop')}
            </AppText>
            <View style={styles.chips}>
              {CROPS.map((code) => (
                <Chip
                  key={code}
                  label={t(`diagnosis.crops.${code}`)}
                  selected={crop === code}
                  onPress={() => {
                    setCrop(code)
                    setProblem(null)
                  }}
                />
              ))}
              {/* a crop of an old field that is not one of the four of the model is kept as it is */}
            </View>
            {crop && !isCrop(crop) ? (
              <AppText variant="small" color={colors.textMuted}>
                {t('fields.currentCrop', { crop })}
              </AppText>
            ) : null}
            {problem === 'noCrop' ? (
              <AppText variant="small" color={colors.danger}>
                {t('fields.problems.noCrop')}
              </AppText>
            ) : null}
          </View>

          <View style={styles.group}>
            <Input
              label={t('fields.area')}
              value={areaText}
              onChangeText={(text) => {
                setAreaText(text)
                setProblem(null)
              }}
              keyboardType="decimal-pad"
              placeholder={formatArea(2.5, i18n.language)}
              error={problem === 'noArea' ? t('fields.problems.noArea') : undefined}
            />
            <View style={styles.chips}>
              {UNITS.map((u) => (
                <Chip
                  key={u}
                  label={t(`fields.units.${u}`)}
                  selected={unit === u}
                  onPress={() => setUnit(u)}
                />
              ))}
            </View>
          </View>

          {problem && !['noName', 'noCrop', 'noArea'].includes(problem) ? (
            <AppText variant="small" color={colors.danger} accessibilityRole="alert">
              {t(`fields.problems.${problem}`)}
            </AppText>
          ) : null}

          <Button
            label={field ? t('fields.saveChanges') : t('fields.save')}
            loading={busy}
            disabled={busy}
            onPress={() => void save()}
          />
          {field ? (
            <Button label={t('fields.delete')} variant="danger" disabled={busy} onPress={remove} />
          ) : null}
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing.xl },
  form: { gap: spacing.lg, paddingBottom: spacing.xl },
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
