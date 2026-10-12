import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/shared/utils/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Action buttons in the bottom right corner. */
  footer?: ReactNode
  className?: string
}

/**
 * Built on the native <dialog>: the browser handles the top layer, focus trapping and Esc.
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the dialog element itself means the backdrop was clicked.
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto max-h-dvh w-full max-w-lg overflow-hidden bg-transparent p-4 backdrop:bg-text/40 backdrop:backdrop-blur-sm"
    >
      {/* Long content scrolls inside; the title and the actions stay visible. */}
      <Card
        glass
        className={cn('flex max-h-[calc(100dvh-2rem)] flex-col bg-white/85 p-6', className)}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-h2 text-text">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 py-1 text-small text-text">
          {children}
        </div>
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </Card>
    </dialog>
  )
}
