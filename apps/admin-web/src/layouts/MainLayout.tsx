import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/layouts/Sidebar'

export function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <Outlet />
      </main>
    </div>
  )
}
