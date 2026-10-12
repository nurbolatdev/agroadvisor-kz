import { EyeOff, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { REQUEST_TYPES } from '@/features/shops/shops'
import type { Shop, ShopRequest } from '@/shared/types'
import { formatRelativeTime } from '@/shared/utils/format'

interface ShopRequestCardProps {
  request: ShopRequest
  /** The shop the request is about; absent for new shops. */
  shop: Shop | undefined
  busy: boolean
  onReject: () => void
  onAccept: () => void
}

const ACCEPT = {
  new_shop: { label: 'Добавить в справочник', icon: Plus, variant: 'primary' },
  wrong_info: { label: 'Исправить', icon: Pencil, variant: 'primary' },
  closed: { label: 'Скрыть магазин', icon: EyeOff, variant: 'danger' },
} as const

export function ShopRequestCard({ request, shop, busy, onReject, onAccept }: ShopRequestCardProps) {
  const type = REQUEST_TYPES[request.type]
  const accept = ACCEPT[request.type]
  const title = request.type === 'new_shop' ? request.payload.name : shop?.name
  const address = request.type === 'new_shop' ? request.payload.address : shop?.address
  const district = request.type === 'new_shop' ? request.payload.district : shop?.district

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge tone={type.tone}>{type.label}</Badge>
        <span className="text-caption font-normal text-text-muted">
          от {request.author.name} · {request.author.district} ·{' '}
          {formatRelativeTime(request.createdAt)}
        </span>
      </div>
      <div>
        <p className="text-[15px] leading-5 font-semibold text-text">
          {title ?? 'Магазин не найден'}
        </p>
        <p className="text-caption font-normal text-text-muted">
          {[address, district && `${district} р-н`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="rounded-xl bg-bg px-3 py-2 text-small text-text">«{request.payload.comment}»</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
          Отклонить
        </Button>
        <Button
          size="sm"
          variant={accept.variant}
          icon={accept.icon}
          disabled={busy || (request.type !== 'new_shop' && !shop)}
          onClick={onAccept}
        >
          {accept.label}
        </Button>
      </div>
    </Card>
  )
}
