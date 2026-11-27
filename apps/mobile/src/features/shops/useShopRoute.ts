import { useState } from 'react'

import type { Shop } from '@/api/shops'
import { storage } from '@/lib/storage'

import { openRoute, rememberedNavigator, rememberNavigator } from './navigator'

// The route button of the card: the remembered navigator opens at once, otherwise (or when it cannot be
// opened any more) the sheet with the choice is shown for the shop. `choose` always shows the sheet.
export function useShopRoute() {
  const [chooseFor, setChooseFor] = useState<Shop | null>(null)

  const navigate = async (shop: Shop) => {
    const app = rememberedNavigator(storage)
    if (app === null) {
      setChooseFor(shop)
      return
    }
    if (!(await openRoute(app, shop))) {
      rememberNavigator(storage, null)
      setChooseFor(shop)
    }
  }

  return {
    chooseFor,
    navigate: (shop: Shop) => void navigate(shop),
    choose: (shop: Shop) => setChooseFor(shop),
    close: () => setChooseFor(null),
  }
}
