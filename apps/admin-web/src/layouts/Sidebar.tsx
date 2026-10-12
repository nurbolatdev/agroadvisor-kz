import { SidebarNav } from '@/layouts/SidebarNav'
import type { SidebarBadges } from '@/layouts/useSidebarCounters'

interface SidebarProps {
  badges: SidebarBadges
}

/** Desktop sidebar (≥ 1024 px); smaller screens use MobileMenu. */
export function Sidebar({ badges }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-62 shrink-0 flex-col border-r border-border bg-white px-4 pt-5 pb-6 lg:flex">
      <SidebarNav badges={badges} />
    </aside>
  )
}
