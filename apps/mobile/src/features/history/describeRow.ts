import type { BadgeTone } from '@/components/ui'

import type { HistoryRowModel } from './historyRow'

export type RowTexts = {
  cropName: (crop: string) => string
  // the name of a disease in the app's language, or undefined while the reference is not loaded
  diseaseName: (code: string) => string | undefined
  statusLabel: (status: HistoryRowModel['status']) => string
  date: string
}

export type RowView = {
  title: string
  subtitle: string
  badge: { label: string; tone: BadgeTone }
}

// The words of one history line. A confident answer is titled with the disease (its code until the
// reference is loaded, as on the result screen) and the subtitle gives crop, confidence and date. The
// other answers name no disease: the title is the crop, the badge says what happened.
export function describeRow(row: HistoryRowModel, texts: RowTexts): RowView {
  const badge = { label: texts.statusLabel(row.status), tone: row.tone }
  const crop = texts.cropName(row.crop)
  const date = texts.date !== '' ? [texts.date] : []
  if (row.diseaseCode === null) {
    return { title: crop, subtitle: date.join(''), badge }
  }
  const confidence = row.confidencePercent !== null ? [`${row.confidencePercent}%`] : []
  return {
    title: texts.diseaseName(row.diseaseCode) ?? row.diseaseCode,
    subtitle: [crop, ...confidence, ...date].join(' · '),
    badge,
  }
}
