import type ru from '@/i18n/locales/ru/aiQuality'
import type { Translation } from '@/i18n/types'

const aiQuality: Translation<typeof ru> = {
  title: 'AI quality and geography',
  subtitle: 'Model quality on real data and the spread of diseases by district',
  percent: '{{value}}%',
  confidence: {
    title: 'Model confidence',
    subtitle: 'distribution of diagnoses, %',
    tooltipValue: 'Share of diagnoses',
    tooltipLabel: 'Confidence {{from}}–{{to}}%',
    belowThreshold: 'below the {{threshold}}% threshold · {{share}}',
  },
  topDiseases: {
    title: 'Top diseases',
    subtitle: 'diagnoses {{period}}',
    openInCatalog: 'Open in the catalog',
  },
  trainingData: {
    title: 'Data for retraining',
    subtitle: 'cases confirmed by an agrochemist or the community',
    ready: 'labeled photos ready for export',
    perWeek: '+{{value}} this week',
    classes_one: '{{count}} class',
    classes_other: '{{count}} classes',
    export: 'Export dataset',
    exporting: 'Preparing the file…',
    exportError: 'Could not prepare the file',
  },
  mismatches: {
    title: 'AI vs expert mismatches',
    subtitle: 'AI gave one diagnosis, an expert confirmed another',
    aiLabel: 'AI diagnosis',
    confirmed: 'Confirmed',
    cases: 'Cases',
  },
  geography: {
    title: 'Disease geography',
    days_one: '{{count}} day',
    days_other: '{{count}} days',
    alerts_one: '{{count}} outbreak',
    alerts_other: '{{count}} outbreaks',
    scheme: 'District scheme',
    districtLevel: '{{district}} district: {{level}}',
    active: 'Active outbreaks',
    cases_one: '{{count}} case',
    cases_other: '{{count}} cases',
    district: '{{district}}',
    growth: 'growth ×{{value}}',
    noGrowth: 'no growth',
    levels: {
      outbreak: 'outbreak',
      growth: 'growth',
      calm: 'calm',
    },
  },
}

export default aiQuality
