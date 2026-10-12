import { Eye, EyeOff, ExternalLink, Save } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { navigatorLinks, SHOP_CATEGORIES } from '@/features/shops/shops'
import { api } from '@/services/api'
import { SHOP_DISTRICTS } from '@/shared/constants/districts'
import type { Shop, ShopCategory, ShopInput } from '@/shared/types'

export interface ShopFormTarget {
  /** Shop being edited; absent when adding a new one. */
  shop?: Shop
  /** Prefilled values, e.g. from a farmer's "new shop" request. */
  initial?: Partial<ShopInput>
  /** Farmer's comment shown above the form. */
  note?: string
  /** Farmer's request that is resolved once the form is saved. */
  requestId?: string
}

interface ShopFormModalProps {
  target: ShopFormTarget | undefined
  onClose: () => void
  onSaved: (shop: Shop) => void
}

type Field = 'name' | 'district' | 'address' | 'lat' | 'lng'

// Kazakhstan bounds from the spec, used to catch swapped or mistyped coordinates.
const LAT_RANGE = [40, 56] as const
const LNG_RANGE = [46, 88] as const

const inRange = (value: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(value) && value >= min && value <= max

export function ShopFormModal({ target, onClose, onSaved }: ShopFormModalProps) {
  const source = { ...target?.initial, ...target?.shop }
  const [name, setName] = useState(source.name ?? '')
  const [district, setDistrict] = useState(source.district ?? '')
  const [address, setAddress] = useState(source.address ?? '')
  const [lat, setLat] = useState(source.lat?.toString() ?? '')
  const [lng, setLng] = useState(source.lng?.toString() ?? '')
  const [hours, setHours] = useState(source.hours ?? '')
  const [phone, setPhone] = useState(source.phone ?? '')
  const [categories, setCategories] = useState<ShopCategory[]>(source.categories ?? [])
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [saveError, setSaveError] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)

  const shop = target?.shop
  const latNumber = Number(lat.replace(',', '.'))
  const lngNumber = Number(lng.replace(',', '.'))
  const coordsValid = inRange(latNumber, LAT_RANGE) && inRange(lngNumber, LNG_RANGE)
  const links = coordsValid ? navigatorLinks({ lat: latNumber, lng: lngNumber }) : undefined

  const validate = () => {
    const next: Partial<Record<Field, string>> = {}
    if (!name.trim()) next.name = 'Укажите название'
    if (!district) next.district = 'Выберите район'
    if (!address.trim()) next.address = 'Укажите адрес'
    if (!inRange(latNumber, LAT_RANGE)) next.lat = `Широта от ${LAT_RANGE[0]} до ${LAT_RANGE[1]}`
    if (!inRange(lngNumber, LNG_RANGE)) next.lng = `Долгота от ${LNG_RANGE[0]} до ${LNG_RANGE[1]}`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const run = async (action: () => Promise<Shop>) => {
    setIsSaving(true)
    setSaveError(undefined)
    try {
      onSaved(await action())
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    } finally {
      setIsSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    const input: ShopInput = {
      name: name.trim(),
      district,
      address: address.trim(),
      lat: latNumber,
      lng: lngNumber,
      hours: hours.trim(),
      phone: phone.trim(),
      categories,
    }
    run(() => api.saveShop(input, shop?.id))
  }

  const toggleCategory = (category: ShopCategory) =>
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )

  return (
    <Modal
      open={target !== undefined}
      onClose={onClose}
      title={shop ? 'Изменить магазин' : 'Добавить магазин'}
      footer={
        <>
          {shop ? (
            <Button
              size="sm"
              variant="ghost"
              icon={shop.status === 'active' ? EyeOff : Eye}
              disabled={isSaving}
              onClick={() =>
                run(() =>
                  api.setShopStatus(shop.id, shop.status === 'active' ? 'hidden' : 'active'),
                )
              }
              className="mr-auto"
            >
              {shop.status === 'active' ? 'Скрыть из приложения' : 'Показать в приложении'}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" icon={Save} type="submit" form="shop-form" disabled={isSaving}>
            {isSaving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      {target?.note ? (
        <p className="mb-4 rounded-xl bg-warning-soft p-3 text-warning-strong">
          Комментарий фермера: {target.note}
        </p>
      ) : null}
      <form id="shop-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Название *"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <Select
          label="Район *"
          placeholder="Выберите район"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          error={errors.district}
          options={SHOP_DISTRICTS.map((item) => ({ value: item, label: item }))}
        />
        <Input
          label="Адрес *"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          error={errors.address}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Широта *"
            inputMode="decimal"
            placeholder="43.2389"
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            error={errors.lat}
          />
          <Input
            label="Долгота *"
            inputMode="decimal"
            placeholder="76.8897"
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            error={errors.lng}
          />
        </div>
        {links ? (
          <p className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small">
            <a
              href={links.twoGis}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Проверить в 2GIS <ExternalLink size={14} aria-hidden="true" />
            </a>
            <a
              href={links.yandex}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Проверить в Яндекс Картах <ExternalLink size={14} aria-hidden="true" />
            </a>
          </p>
        ) : null}
        <Input
          label="Часы работы"
          placeholder="Пн–Сб 08:00–19:00"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
        <div>
          <Input
            label="Телефон"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-describedby="shop-phone-hint"
          />
          <p id="shop-phone-hint" className="mt-1.5 text-caption font-normal text-text-muted">
            Виден только администраторам — у фермеров нет кнопки звонка
          </p>
        </div>
        <fieldset>
          <legend className="mb-2 text-small font-medium text-text">Категории</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SHOP_CATEGORIES) as ShopCategory[]).map((category) => (
              <Chip
                key={category}
                selected={categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {SHOP_CATEGORIES[category]}
              </Chip>
            ))}
          </div>
        </fieldset>
        {saveError ? (
          <p role="alert" className="text-danger">
            {saveError}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
