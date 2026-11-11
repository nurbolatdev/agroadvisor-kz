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
  login: '/login',
  notFound: '*',
} as const

export const getDiseaseDetailPath = (id: string) => `${ROUTES.diseases}/${encodeURIComponent(id)}`
