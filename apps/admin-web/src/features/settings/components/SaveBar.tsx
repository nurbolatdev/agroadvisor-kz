import { CircleCheck, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface SaveBarProps {
  isDirty: boolean
  justSaved: boolean
  canSave: boolean
  onSave: () => void
  onDiscard: () => void
}

/** Sticky bar shown only while there are unsaved changes, plus a short confirmation. */
export function SaveBar({ isDirty, justSaved, canSave, onSave, onDiscard }: SaveBarProps) {
  return (
    <div aria-live="polite" className="sticky bottom-4 z-20 mt-4 flex justify-end">
      {isDirty ? (
        <Card glass className="flex items-center gap-3 border-border p-3 shadow-lg">
          <span className="hidden px-2 text-small text-text-muted sm:inline">
            Есть несохранённые изменения
          </span>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Сбросить
          </Button>
          <Button size="sm" icon={Save} disabled={!canSave} onClick={onSave}>
            Сохранить изменения
          </Button>
        </Card>
      ) : justSaved ? (
        <Card
          glass
          className="flex items-center gap-2 border-border p-3 text-small font-semibold text-primary shadow-lg"
        >
          <CircleCheck size={18} aria-hidden="true" />
          Сохранено
        </Card>
      ) : null}
    </div>
  )
}
