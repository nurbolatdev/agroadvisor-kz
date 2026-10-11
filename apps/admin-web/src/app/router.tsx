import { createBrowserRouter } from 'react-router-dom'
import { AgrochemistsPage } from '@/features/agrochemists/pages/AgrochemistsPage'
import { AiQualityPage } from '@/features/ai-quality/pages/AiQualityPage'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { DiseaseDetailPage } from '@/features/diseases/pages/DiseaseDetailPage'
import { DiseasesPage } from '@/features/diseases/pages/DiseasesPage'
import { ModerationPage } from '@/features/moderation/pages/ModerationPage'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'
import { ShopsPage } from '@/features/shops/pages/ShopsPage'
import { UsersPage } from '@/features/users/pages/UsersPage'
import { MainLayout } from '@/layouts/MainLayout'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ROUTES } from '@/shared/constants/routes'

export const router = createBrowserRouter(
  [
    {
      element: <MainLayout />,
      children: [
        { path: ROUTES.dashboard, element: <DashboardPage /> },
        { path: ROUTES.aiQuality, element: <AiQualityPage /> },
        { path: ROUTES.community, element: <CommunityPage /> },
        { path: ROUTES.moderation, element: <ModerationPage /> },
        { path: ROUTES.verification, element: <AgrochemistsPage /> },
        { path: ROUTES.users, element: <UsersPage /> },
        { path: ROUTES.shops, element: <ShopsPage /> },
        { path: ROUTES.diseases, element: <DiseasesPage /> },
        { path: ROUTES.diseaseDetail, element: <DiseaseDetailPage /> },
        { path: ROUTES.settings, element: <SettingsPage /> },
      ],
    },
    { path: ROUTES.notFound, element: <NotFoundPage /> },
  ],
  {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
)
