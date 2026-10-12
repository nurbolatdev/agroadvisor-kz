import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader } from '@/components/ui/Loader'
import { Footer } from '@/layouts/Footer'
import { MobileMenu } from '@/layouts/MobileMenu'
import { Sidebar } from '@/layouts/Sidebar'
import { useSidebarCounters } from '@/layouts/useSidebarCounters'

export function MainLayout() {
  const badges = useSidebarCounters()

  return (
    <div className="flex min-h-screen">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileMenu badges={badges} />
        <div className="flex flex-1 flex-col px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <main className="flex-1">
            {/* Pages are lazy-loaded chunks; the sidebar stays while a page loads. */}
            <Suspense fallback={<Loader />}>
              <Outlet />
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
