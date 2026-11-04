import type { StatusVariant } from '@/components/ui'

import type { HistoryRowModel } from './historyRow'

export type RowTexts = {
  cropName: (crop: string) => string
  // the name of a disease in the app's language, or undefined while the reference is not loaded
  diseaseName: (code: string) => string | undefined
  statusLabel: (variant: StatusVariant) => string
  date: string
}

export type RowView = {
  title: string
  subtitle: string
  badge: { label: string; variant: StatusVariant }
}

// The words of one history line (screen 19): a title, "crop · date · confidence" and a status badge.
// A confident answer is titled with the disease (its code until the reference is loaded, as on the result
// screen); an answer that names no disease is titled with the word "not identified".
export function describeRow(row: HistoryRowModel, texts: RowTexts): RowView {
  const subtitle = [
    texts.cropName(row.crop),
    ...(texts.date !== '' ? [texts.date] : []),
    ...(row.confidencePercent !== null ? [`${row.confidencePercent}%`] : []),
  ].join(' · ')
  const badge = { label: texts.statusLabel(row.variant), variant: row.variant }
  const title =
    row.diseaseCode !== null
      ? (texts.diseaseName(row.diseaseCode) ?? row.diseaseCode)
      : texts.statusLabel('undetermined')
  return { title, subtitle, badge }
}
