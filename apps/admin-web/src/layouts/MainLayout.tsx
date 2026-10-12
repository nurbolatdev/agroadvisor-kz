import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader } from '@/components/ui/Loader'
import { Footer } from '@/layouts/Footer'
import { Sidebar } from '@/layouts/Sidebar'

export function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <main className="flex-1">
          {/* Pages are lazy-loaded chunks; the sidebar stays while a page loads. */}
          <Suspense fallback={<Loader />}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
      </div>
    </div>
  )
}
