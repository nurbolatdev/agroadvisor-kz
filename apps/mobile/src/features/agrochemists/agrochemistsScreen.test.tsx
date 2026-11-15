import { fireEvent, render, screen } from '@testing-library/react-native'

import type { AgrochemistCard } from '@/api/agrochemistDirectory'
import { NetworkError } from '@/api/errors'
import AgrochemistsScreen from '@/app/(app)/agrochemists'
import { initI18n } from '@/i18n'

const mockList = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
let mockRegion: number | null = 7

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { language: string }) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => ({
  agrochemistDirectoryApi: { list: (...args: unknown[]) => mockList(...args) },
  regionsApi: { list: () => Promise.resolve([{ id: 7, code: 'south', name: 'South Region' }]) },
  useProfile: (select: (s: { me: { regionId: number | null } }) => unknown) =>
    select({ me: { regionId: mockRegion } }),
}))

const card = (id: string, fullName: string, extra: Partial<AgrochemistCard> = {}) => ({
  id,
  fullName,
  crops: ['tomato'],
  specializations: ['plant_protection'],
  experienceYears: 12,
  regionId: 7,
  verifiedAt: '2026-10-01T09:00:00Z',
  ...extra,
})

const ITEMS = [
  card('a1', 'Aigul Sarsenova'),
  card('a2', 'Bauyrzhan Ospanov', { specializations: ['soil_science'], experienceYears: 8 }),
]

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockRegion = 7
  mockList.mockResolvedValue(ITEMS)
})

async function openScreen() {
  await render(<AgrochemistsScreen />)
  await screen.findByText('Aigul Sarsenova')
}

describe('agrochemists screen', () => {
  it('lists the agrochemists with the specialization and the experience', async () => {
    await openScreen()

    expect(screen.getByText('Bauyrzhan Ospanov')).toBeTruthy()
    expect(screen.getByText('Plant protection · 12 years')).toBeTruthy()
    expect(screen.getByText('Soil science · 8 years')).toBeTruthy()
  })

  it('writes the region of every agrochemist once the regions are read', async () => {
    await openScreen()

    expect(await screen.findAllByText('South Region')).toHaveLength(2)
  })

  it('names the status and the facts of a card for a screen reader', async () => {
    await openScreen()
    await screen.findAllByText('South Region')

    expect(
      screen.getByLabelText(
        'Aigul Sarsenova, Verified agrochemist, Plant protection · 12 years, South Region',
      ),
    ).toBeTruthy()
  })

  it('starts with the crop of the diagnosis and names the diagnosis under the title', async () => {
    mockParams = { crop: 'tomato', name: 'Late blight' }
    await openScreen()

    expect(mockList).toHaveBeenCalledWith({ crop: 'tomato', regionId: undefined, size: 50 })
    expect(screen.getByText('For the diagnosis “Late blight”')).toBeTruthy()
  })

  it('narrows the list to the region of the farmer with "near me"', async () => {
    await openScreen()

    await fireEvent.press(screen.getByText('Near me'))

    await screen.findByText('Aigul Sarsenova')
    expect(mockList).toHaveBeenLastCalledWith({ crop: undefined, regionId: 7, size: 50 })
  })

  it('has no "near me" when the farmer gave no region', async () => {
    mockRegion = null
    await openScreen()

    expect(screen.queryByText('Near me')).toBeNull()
  })

  it('searches by the name on the loaded page', async () => {
    await openScreen()

    await fireEvent.changeText(screen.getByPlaceholderText('Name or specialization'), 'ospa')

    expect(screen.queryByText('Aigul Sarsenova')).toBeNull()
    expect(screen.getByText('Bauyrzhan Ospanov')).toBeTruthy()
  })

  it('opens the profile and carries the diagnosis along', async () => {
    mockParams = { diagnosisId: 'd1' }
    await openScreen()

    await fireEvent.press(screen.getByText('Aigul Sarsenova'))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/agrochemists/[id]',
      params: { id: 'a1', diagnosisId: 'd1' },
    })
  })

  it('says so when nobody is found, and offers to retry after an error', async () => {
    mockList.mockResolvedValueOnce([])
    await render(<AgrochemistsScreen />)
    expect(await screen.findByText('No agrochemists found')).toBeTruthy()
  })

  it('shows the error of the network with a retry', async () => {
    mockList.mockRejectedValueOnce(new NetworkError())
    await render(<AgrochemistsScreen />)

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('Aigul Sarsenova')).toBeTruthy()
  })
})
