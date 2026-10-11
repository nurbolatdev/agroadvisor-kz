export const ROUTES = {
  dashboard: '/',
  moderation: '/moderation',
  agrochemists: '/agrochemists',
  diseases: '/diseases',
  diseaseDetail: '/diseases/:id',
  users: '/users',
  notFound: '*',
} as const

export const getDiseaseDetailPath = (id: string) => `${ROUTES.diseases}/${encodeURIComponent(id)}`
