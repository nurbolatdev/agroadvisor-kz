import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  SprayCan,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import type { Weather } from '@/api/weather'
import { AppText, BackHeader, EmptyState, ErrorState, Screen } from '@/components/ui'
import { isCrop } from '@/features/diagnosis/crops'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import {
  type Advice,
  type Day,
  type HourTone,
  type Sky,
  adviceOf,
  clock,
  daysOf,
  degrees,
  skyOf,
  stripOf,
  toneOf,
  weekday,
} from './helpers'
import { useFieldWeather } from './useFieldWeather'

const SKY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

// The tile of an hour: green when it is good to spray, yellow when it nearly is, red when it is not
const TONE: Record<
  HourTone,
  { background: string; border: string; key: 'sprayGood' | 'sprayWarn' | 'sprayBad' }
> = {
  good: { background: colors.primarySoft, border: colors.primarySoft, key: 'sprayGood' },
  warn: { background: colors.warningSoft, border: colors.warningSoft, key: 'sprayWarn' },
  bad: { background: colors.dangerSoft, border: colors.dangerSoft, key: 'sprayBad' },
}

// The weather of a field (screen 28): now, whether to spray today, the next hours and five days. The
// frame also has the humidity and the "feels like" temperature: the server does not send them, so they are not
// drawn. The "sowing and watering" frame (14) needs a soil moisture the server does not have either.
export function WeatherScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { fieldId } = useLocalSearchParams<{ fieldId: string }>()
  const { state, load } = useFieldWeather(fieldId)
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const cropName = (crop: string) => (isCrop(crop) ? t(`diagnosis.crops.${crop}`) : crop)

  return (
    <Screen>
      <BackHeader
        title={t('weather.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : state.status === 'error' ? (
        <ErrorState message={t(`weather.errors.${state.reason}`)} onRetry={load} />
      ) : state.status === 'notFound' ? (
        <EmptyState title={t('fields.notFound')} />
      ) : state.status === 'noPoint' ? (
        <EmptyState title={t('weather.noPoint')} message={t('weather.noPointHint')} />
      ) : (
        <ScrollView testID="weather-content" contentContainerStyle={styles.content}>
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
            {`${state.field.name} · ${cropName(state.field.crop)}`}
          </AppText>
          {state.failed ? (
            <AppText variant="small" color={colors.danger}>
              {t(`weather.errors.${state.failed}`)}
            </AppText>
          ) : null}
          <Now weather={state.weather} />
          <SprayCard advice={adviceOf(state.weather)} language={i18n.language} />
          <Hours weather={state.weather} />
          <Days weather={state.weather} language={i18n.language} />
        </ScrollView>
      )}
    </Screen>
  )
}

function Now({ weather }: { weather: Weather }) {
  const { t } = useTranslation()
  const { current } = weather
  const sky = skyOf(current.weatherCode)
  const Icon = SKY_ICON[sky]
  return (
    <View style={styles.card}>
      <Icon size={sizes.iconLg} color={colors.warning} />
      <View style={styles.nowText}>
        <AppText variant="display">{degrees(current.temperatureC)}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {t(`weather.sky.${sky}`)}
        </AppText>
      </View>
      <View style={styles.facts}>
        <View style={styles.fact}>
          <Wind size={sizes.iconSm} color={colors.textMuted} />
          <AppText variant="small" color={colors.textMuted}>
            {t('weather.wind', { value: Math.round(current.windMs) })}
          </AppText>
        </View>
        {current.precipitationMm > 0 ? (
          <View style={styles.fact}>
            <Droplets size={sizes.iconSm} color={colors.textMuted} />
            <AppText variant="small" color={colors.textMuted}>
              {t('weather.precipitation', {
                value: Math.round(current.precipitationMm * 10) / 10,
              })}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function SprayCard({ advice, language }: { advice: Advice; language: string }) {
  const { t } = useTranslation()
  const good = advice.kind === 'today'
  const tone = good ? colors.primary : colors.danger
  const title = good
    ? t('weather.today')
    : t(advice.kind === 'later' ? 'weather.later' : 'weather.none')
  let detail: string
  if (advice.kind === 'today') {
    detail = t('weather.todayWindow', {
      from: clock(advice.window.from),
      to: clock(advice.window.to),
    })
  } else if (advice.kind === 'later') {
    detail = t('weather.laterWindow', {
      day: weekday(advice.window.from.slice(0, 10), language),
      from: clock(advice.window.from),
      to: clock(advice.window.to),
    })
  } else {
    detail = t('weather.noneWindow')
  }
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.spray, { backgroundColor: good ? colors.primarySoft : colors.dangerSoft }]}
    >
      <SprayCan size={sizes.iconMd} color={tone} />
      <View style={styles.sprayText}>
        <AppText variant="h2" color={tone}>
          {title}
        </AppText>
        <AppText variant="body" color={tone}>
          {detail}
        </AppText>
        {good ? (
          <AppText variant="small" color={tone} style={styles.rule}>
            {t('weather.rule')}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

function Hours({ weather }: { weather: Weather }) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <AppText variant="h2">{t('weather.hourly')}</AppText>
      <View style={styles.strip}>
        {stripOf(weather.hours).map((hour) => {
          const tone = TONE[toneOf(hour)]
          const Icon = SKY_ICON[skyOf(hour.weatherCode)]
          return (
            <View
              key={hour.time}
              accessible
              accessibilityLabel={`${clock(hour.time)}, ${degrees(hour.temperatureC)}, ${t(`weather.${tone.key}`)}`}
              style={[styles.hour, { backgroundColor: tone.background, borderColor: tone.border }]}
            >
              <AppText variant="caption" color={colors.textMuted}>
                {clock(hour.time).slice(0, 2)}
              </AppText>
              <Icon size={sizes.iconMd} color={colors.text} />
              <AppText variant="caption">{degrees(hour.temperatureC)}</AppText>
              <AppText variant="badge" color={colors.textMuted}>
                {t('weather.wind', { value: Math.round(hour.windMs) })}
              </AppText>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function Days({ weather, language }: { weather: Weather; language: string }) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <AppText variant="h2">{t('weather.days')}</AppText>
      {daysOf(weather.hours).map((day) => (
        <DayRow key={day.date} day={day} language={language} />
      ))}
    </View>
  )
}

function DayRow({ day, language }: { day: Day; language: string }) {
  const { t } = useTranslation()
  const Icon = SKY_ICON[skyOf(day.code)]
  const label = t(`weather.spray.${day.spray ?? 'none'}`)
  const tone = day.spray === null ? 'bad' : day.spray === 'allDay' ? 'good' : 'warn'
  const badge = {
    good: { background: colors.primarySoft, text: colors.primary },
    warn: { background: colors.warningSoft, text: colors.text },
    bad: { background: colors.dangerSoft, text: colors.danger },
  }[tone]
  return (
    <View
      accessible
      accessibilityLabel={`${weekday(day.date, language)}, ${degrees(day.minC)} / ${degrees(day.maxC)}, ${label}`}
      style={styles.day}
    >
      <AppText variant="body" style={styles.dayName}>
        {weekday(day.date, language)}
      </AppText>
      <Icon size={sizes.iconMd} color={colors.text} />
      <AppText variant="small" color={colors.textMuted} style={styles.dayTemp}>
        {`${degrees(day.minC)} / ${degrees(day.maxC)}`}
      </AppText>
      <View style={[styles.badge, { backgroundColor: badge.background }]}>
        <AppText variant="caption" color={badge.text}>
          {label}
        </AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  nowText: { flex: 1 },
  facts: { gap: spacing.xs },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spray: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  sprayText: { flex: 1, gap: spacing.xs },
  rule: { marginTop: spacing.xs },
  section: { gap: spacing.md },
  strip: { flexDirection: 'row', gap: spacing.sm },
  hour: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayName: { width: sizes.touch },
  dayTemp: { flex: 1, textAlign: 'center' },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
})
