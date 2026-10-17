import type ru from '@/i18n/locales/ru/settings'
import type { Translation } from '@/i18n/types'

const settings: Translation<typeof ru> = {
  title: 'Settings',
  subtitle: 'Profile and admin panel preferences',
  profile: {
    title: 'Profile',
    subtitle: 'How other administrators see you',
    noName: 'No name',
    name: 'Name',
    nameRequired: 'Enter a name',
    email: 'Email',
  },
  interface: {
    title: 'Interface',
    subtitle: 'Language and the period analytics opens with',
    language: 'Language',
    languageLabel: 'Interface language',
    languageHint: 'Same choice as in the menu. The language changes after saving.',
    period: 'Default period',
    periodHint: 'Overview, AI quality and Community open with it.',
  },
  aiModel: {
    title: 'AI model',
    subtitle: 'When a diagnosis counts as uncertain',
    threshold: 'Confidence threshold, %',
    thresholdError: 'From {{min}} to {{max}} in steps of {{step}}',
    hint: 'Diagnoses below the threshold count as uncertain: the farmer is offered to ask an agrochemist. The threshold is used in the AI quality histogram and in the “Uncertain” KPI on the Overview.',
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'What to notify the administrator about',
    items: {
      complaints: {
        label: 'New complaints',
        description: 'About posts and answers in the community',
      },
      verifications: {
        label: 'Agrochemist verification requests',
        description: 'New diplomas and certificates',
      },
      shopRequests: {
        label: 'Agro shop requests',
        description: 'New shops and data errors',
      },
      weeklyReport: { label: 'Weekly email report', description: 'Summary every Monday' },
    },
  },
  saveBar: {
    unsaved: 'You have unsaved changes',
    discard: 'Discard',
    save: 'Save changes',
    saved: 'Saved',
  },
}

export default settings
