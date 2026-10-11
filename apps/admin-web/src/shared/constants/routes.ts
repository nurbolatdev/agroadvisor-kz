export const ROUTES = {
  dashboard: '/',
  aiQuality: '/ai-quality',
  community: '/community',
  moderation: '/moderation',
  verification: '/verification',
  users: '/users',
  shops: '/shops',
  diseases: '/diseases',
  diseaseDetail: '/diseases/:id',
  settings: '/settings',
  notFound: '*',
} as const

export const getDiseaseDetailPath = (id: string) => `${ROUTES.diseases}/${encodeURIComponent(id)}`
