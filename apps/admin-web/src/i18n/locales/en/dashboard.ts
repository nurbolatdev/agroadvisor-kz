import type ru from '@/i18n/locales/ru/dashboard'
import type { Translation } from '@/i18n/types'

const dashboard: Translation<typeof ru> = {
  title: 'Overview',
  subtitle: 'Data {{period}}',
  subtitleUpdated: 'Data {{period}} · updated today at {{time}}',
  kpi: {
    activeUsers: 'Active users',
    vsPrevious: '{{change}}% vs previous period',
    diagnoses: 'Diagnoses',
    avgConfidence: 'Average confidence',
    points: '{{change}} pp',
    lowConfidence: 'Uncertain (<{{threshold}}%)',
    openComplaints: 'Open complaints',
    perDay: '{{change}} in 24 h',
    pendingVerifications: 'Awaiting verification',
    actionNeeded: 'action needed',
    allVerified: 'all verified',
  },
  diagnosesChart: {
    titleDaily: 'Diagnoses per day',
    titleWeekly: 'Diagnoses per week',
    subtitleDaily: '{{total}} {{period}} · {{average}} per day on average',
    subtitleWeekly: '{{total}} {{period}} · {{average}} per week on average',
    tooltip: 'Diagnoses',
  },
  newUsers: {
    title: 'New users',
    byWeeks: 'by week',
    byMonths: 'by month',
    farmers: 'farmers',
    agrochemists: 'agrochemists',
  },
  funnel: {
    title: 'Farmer journey funnel',
    subtitle: 'from a photo to buying a product',
    avgTime: 'Average time from diagnosis to first advice',
    steps: {
      photo: 'Took a photo',
      diagnosis: 'Got a diagnosis',
      treatment_plan: 'Opened the treatment plan',
      expert_or_community: 'Agrochemist or community',
      shops_map: 'Opened the shops map',
    },
  },
}

export default dashboard
