import { Outlet } from 'react-router-dom'

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
