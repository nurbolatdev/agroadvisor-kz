import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '@/services/api'
import { ROUTES } from '@/shared/constants/routes'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { onDataChanged } from '@/shared/utils/dataEvents'

export type SidebarBadges = Partial<Record<string, number>>

/** Red counters next to menu items, keyed by route. */
export function useSidebarCounters(): SidebarBadges {
  // Refresh on navigation and after actions such as resolving a complaint.
  const { pathname } = useLocation()
  const { data: counters, reload } = useApiQuery(() => api.getSidebarCounters(), [pathname])
  useEffect(() => onDataChanged(reload), [reload])

  return {
    [ROUTES.moderation]: counters?.newComplaints,
    [ROUTES.verification]: counters?.pendingVerifications,
  }
}
