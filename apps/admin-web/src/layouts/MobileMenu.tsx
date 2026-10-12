import { Menu, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { BrandLink } from '@/layouts/BrandLink'
import { SidebarNav } from '@/layouts/SidebarNav'
import type { SidebarBadges } from '@/layouts/useSidebarCounters'

interface MobileMenuProps {
  badges: SidebarBadges
}

/**
 * Top bar with a burger for screens below 1024 px. The menu is a native <dialog>
 * sliding over the content on a glass surface, so focus trapping and Esc come for free.
 */
export function MobileMenu({ badges }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const menuId = useId()
  const hasCounters = Object.values(badges).some((count) => (count ?? 0) > 0)
  const close = () => setOpen(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-white/70 px-2 backdrop-blur-md lg:hidden">
        <BrandLink />
        <button
          type="button"
          aria-label="Открыть меню"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(true)}
          className="relative flex size-12 items-center justify-center rounded-xl text-text hover:bg-bg focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <Menu size={24} aria-hidden="true" />
          {hasCounters ? (
            <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-danger ring-2 ring-white">
              <span className="sr-only">Есть новые задачи</span>
            </span>
          ) : null}
        </button>
      </header>

      <dialog
        ref={dialogRef}
        id={menuId}
        aria-label="Меню"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-transparent p-0 backdrop:bg-text/30 backdrop:backdrop-blur-sm"
      >
        <div className="relative flex h-full flex-col border-r border-white/40 bg-white/80 px-4 pt-5 pb-6 backdrop-blur-md">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={close}
            className="absolute top-4 right-3 flex size-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <SidebarNav badges={badges} onNavigate={close} />
        </div>
      </dialog>
    </>
  )
}
