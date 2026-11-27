import {
  NAVIGATOR_KEY,
  openRoute,
  rememberedNavigator,
  rememberNavigator,
  routeUrls,
  type NavigatorStore,
} from './navigator'

const point = { latitude: 43.2220001, longitude: -76.8512 }

function memoryStore(): NavigatorStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getString: (key) => data.get(key),
    set: (key, value) => {
      data.set(key, value)
    },
    remove: (key) => data.delete(key),
  }
}

describe('routeUrls', () => {
  it('puts longitude first for 2GIS', () => {
    expect(routeUrls('2gis', point)).toEqual({
      app: 'dgis://2gis.ru/routeSearch/rsType/car/to/-76.851200,43.222000',
      web: 'https://2gis.kz/routeSearch/rsType/car/to/-76.851200,43.222000',
    })
  })

  it('puts latitude first for Yandex Maps', () => {
    expect(routeUrls('yandex', point)).toEqual({
      app: 'yandexmaps://maps.yandex.ru/?rtext=~43.222000,-76.851200&rtt=auto',
      web: 'https://yandex.kz/maps/?rtext=~43.222000,-76.851200&rtt=auto',
    })
  })

  it('has a single link for Google Maps', () => {
    expect(routeUrls('google', point)).toEqual({
      web: 'https://www.google.com/maps/dir/?api=1&destination=43.222000,-76.851200&travelmode=driving',
    })
  })
})

describe('openRoute', () => {
  it('opens the app link first', async () => {
    const openURL = jest.fn().mockResolvedValue(true)
    await expect(openRoute('2gis', point, openURL)).resolves.toBe(true)
    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL.mock.calls[0][0]).toMatch(/^dgis:/)
  })

  it('falls back to the web link when the app link is refused', async () => {
    const openURL = jest.fn().mockRejectedValueOnce(new Error('no app')).mockResolvedValue(true)
    await expect(openRoute('yandex', point, openURL)).resolves.toBe(true)
    expect(openURL).toHaveBeenCalledTimes(2)
    expect(openURL.mock.calls[1][0]).toMatch(/^https:\/\/yandex\.kz/)
  })

  it('returns false when both links are refused', async () => {
    const openURL = jest.fn().mockRejectedValue(new Error('refused'))
    await expect(openRoute('2gis', point, openURL)).resolves.toBe(false)
    expect(openURL).toHaveBeenCalledTimes(2)
  })

  it('opens the single Google link', async () => {
    const openURL = jest.fn().mockResolvedValue(true)
    await expect(openRoute('google', point, openURL)).resolves.toBe(true)
    expect(openURL).toHaveBeenCalledTimes(1)
  })

  it('returns false when the only Google link is refused', async () => {
    const openURL = jest.fn().mockRejectedValue(new Error('refused'))
    await expect(openRoute('google', point, openURL)).resolves.toBe(false)
  })
})

describe('the remembered navigator', () => {
  it('is empty by default', () => {
    expect(rememberedNavigator(memoryStore())).toBeNull()
  })

  it('saves and reads the choice', () => {
    const store = memoryStore()
    rememberNavigator(store, 'yandex')
    expect(store.data.get(NAVIGATOR_KEY)).toBe('yandex')
    expect(rememberedNavigator(store)).toBe('yandex')
  })

  it('clears the choice', () => {
    const store = memoryStore()
    rememberNavigator(store, 'google')
    rememberNavigator(store, null)
    expect(rememberedNavigator(store)).toBeNull()
  })

  it('treats an unknown value as empty', () => {
    const store = memoryStore()
    store.data.set(NAVIGATOR_KEY, 'waze')
    expect(rememberedNavigator(store)).toBeNull()
  })
})
