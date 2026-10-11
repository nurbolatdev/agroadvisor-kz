import { createBrowserRouter } from 'react-router-dom'
import { AgrochemistsPage } from '@/features/agrochemists/pages/AgrochemistsPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { DiseaseDetailPage } from '@/features/diseases/pages/DiseaseDetailPage'
import { DiseasesPage } from '@/features/diseases/pages/DiseasesPage'
import { ModerationPage } from '@/features/moderation/pages/ModerationPage'
import { UsersPage } from '@/features/users/pages/UsersPage'
import { ROUTES } from '@/shared/constants/routes'

export const router = createBrowserRouter(
  [
    { path: ROUTES.dashboard, element: <DashboardPage /> },
    { path: ROUTES.moderation, element: <ModerationPage /> },
    { path: ROUTES.agrochemists, element: <AgrochemistsPage /> },
    { path: ROUTES.diseases, element: <DiseasesPage /> },
    { path: ROUTES.diseaseDetail, element: <DiseaseDetailPage /> },
    { path: ROUTES.users, element: <UsersPage /> },
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
