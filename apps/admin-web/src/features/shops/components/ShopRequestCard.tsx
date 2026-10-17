import { EyeOff, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { REQUEST_TYPE_TONES } from '@/features/shops/shops'
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
  new_shop: { icon: Plus, variant: 'primary' },
  wrong_info: { icon: Pencil, variant: 'primary' },
  closed: { icon: EyeOff, variant: 'danger' },
} as const

export function ShopRequestCard({ request, shop, busy, onReject, onAccept }: ShopRequestCardProps) {
  const { t } = useTranslation(['shops', 'common'])
  const accept = ACCEPT[request.type]
  const title = request.type === 'new_shop' ? request.payload.name : shop?.name
  const address = request.type === 'new_shop' ? request.payload.address : shop?.address
  const district = request.type === 'new_shop' ? request.payload.district : shop?.district

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge tone={REQUEST_TYPE_TONES[request.type]}>{t(`requestTypes.${request.type}`)}</Badge>
        <span className="text-caption font-normal text-text-muted">
          {t('requests.from', {
            name: request.author.name,
            district: request.author.district,
            time: formatRelativeTime(request.createdAt),
          })}
        </span>
      </div>
      <div>
        <p className="text-[15px] leading-5 font-semibold text-text">
          {title ?? t('requests.shopMissing')}
        </p>
        <p className="text-caption font-normal text-text-muted">
          {[address, district && t('requests.district', { district })].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="rounded-xl bg-bg px-3 py-2 text-small text-text">«{request.payload.comment}»</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
          {t('common:actions.reject')}
        </Button>
        <Button
          size="sm"
          variant={accept.variant}
          icon={accept.icon}
          disabled={busy || (request.type !== 'new_shop' && !shop)}
          onClick={onAccept}
        >
          {t(`requests.accept.${request.type}`)}
        </Button>
      </div>
    </Card>
  )
}
