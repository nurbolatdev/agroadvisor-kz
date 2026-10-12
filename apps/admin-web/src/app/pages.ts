import { lazy } from 'react'

// Each page is a separate chunk, so heavy dependencies (Recharts on the overview)
// load only when that page is opened. MainLayout shows a Loader meanwhile.
export const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
export const AiQualityPage = lazy(() =>
  import('@/features/ai-quality/pages/AiQualityPage').then((m) => ({ default: m.AiQualityPage })),
)
export const CommunityPage = lazy(() =>
  import('@/features/community/pages/CommunityPage').then((m) => ({ default: m.CommunityPage })),
)
export const ModerationPage = lazy(() =>
  import('@/features/moderation/pages/ModerationPage').then((m) => ({ default: m.ModerationPage })),
)
export const AgrochemistsPage = lazy(() =>
  import('@/features/agrochemists/pages/AgrochemistsPage').then((m) => ({
    default: m.AgrochemistsPage,
  })),
)
export const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((m) => ({ default: m.UsersPage })),
)
export const ShopsPage = lazy(() =>
  import('@/features/shops/pages/ShopsPage').then((m) => ({ default: m.ShopsPage })),
)
export const DiseasesPage = lazy(() =>
  import('@/features/diseases/pages/DiseasesPage').then((m) => ({ default: m.DiseasesPage })),
)
export const DiseaseDetailPage = lazy(() =>
  import('@/features/diseases/pages/DiseaseDetailPage').then((m) => ({
    default: m.DiseaseDetailPage,
  })),
)
export const SettingsPage = lazy(() =>
  import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
