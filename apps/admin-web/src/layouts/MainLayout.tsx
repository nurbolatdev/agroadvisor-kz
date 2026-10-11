import { Outlet } from 'react-router-dom'
import { Footer } from '@/layouts/Footer'
import { Sidebar } from '@/layouts/Sidebar'

export function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
