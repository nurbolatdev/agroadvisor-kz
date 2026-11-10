import appConfig from '../../app.json'
import en from '../../locales/en.json'
import kk from '../../locales/kk.json'
import ru from '../../locales/ru.json'

type PluginOptions = Record<string, unknown>

function pluginOptions(name: string): PluginOptions {
  const plugins = appConfig.expo.plugins as unknown[]
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === name) as
    [string, PluginOptions] | undefined
  if (!entry) throw new Error(`plugin ${name} not found in app.json`)
  return entry[1]
}

const locales = { ru, kk, en }
const KEYS = ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']

describe('iOS permission texts', () => {
  it.each(Object.entries(locales))('%s has the two non-empty ios texts', (_name, file) => {
    expect(Object.keys(file)).toEqual(['ios'])
    expect(Object.keys(file.ios).sort()).toEqual(KEYS)
    for (const key of KEYS) {
      const text = (file.ios as Record<string, string>)[key]
      expect(typeof text).toBe('string')
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })

  it('ru camera text equals the app.json camera texts', () => {
    expect(ru.ios.NSCameraUsageDescription).toBe(pluginOptions('expo-camera').cameraPermission)
    expect(ru.ios.NSCameraUsageDescription).toBe(
      pluginOptions('expo-image-picker').cameraPermission,
    )
  })

  it('ru photo text equals the app.json photos text', () => {
    expect(ru.ios.NSPhotoLibraryUsageDescription).toBe(
      pluginOptions('expo-image-picker').photosPermission,
    )
  })
})
