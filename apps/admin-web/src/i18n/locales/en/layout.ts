import type ru from '@/i18n/locales/ru/layout'
import type { Translation } from '@/i18n/types'

const layout: Translation<typeof ru> = {
  nav: {
    label: 'Main navigation',
    groups: { analytics: 'Analytics', management: 'Management' },
    dashboard: 'Overview',
    aiQuality: 'AI quality',
    community: 'Community',
    moderation: 'Moderation',
    verification: 'Verification',
    users: 'Users',
    shops: 'Agro shops',
    diseases: 'Diseases and products',
    settings: 'Settings',
    newItems: 'new',
  },
  menu: {
    title: 'Menu',
    open: 'Open menu',
    close: 'Close menu',
    hasTasks: 'There are new tasks',
  },
  notFound: {
    title: 'Page not found',
    description: 'The page you are looking for does not exist or was moved.',
    action: 'Go to overview',
  },
  language: 'Interface language',
}

export default layout
