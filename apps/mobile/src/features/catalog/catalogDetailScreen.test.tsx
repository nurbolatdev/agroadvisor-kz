import { fireEvent, render, screen } from '@testing-library/react-native'

import type { DiseaseDetail } from '@/api/diseases'
import CatalogDetailScreen from '@/app/(app)/catalog/[code]'
import { initI18n } from '@/i18n'

const mockDetail = jest.fn()
const mockBack = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ code: 'potato__late_blight' }),
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { language: string }) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => ({
  diseaseCatalog: { detail: (...args: unknown[]) => mockDetail(...args) },
}))

const LONG_NAME = 'Potato tuber black scurf and stem canker caused by Rhizoctonia'

const DETAIL: DiseaseDetail = {
  disease: {
    code: 'potato__late_blight',
    cropCode: 'potato',
    kind: 'oomycete',
    severity: 'high',
    name: LONG_NAME,
    latinName: 'Phytophthora infestans',
  },
  symptoms: ['Dark spots on the leaves', 'White coating under the leaf'],
  conditions: 'Humid and cool weather',
  prevention: undefined,
  treatments: [
    { product: 'Fungicide A', type: 'chemical', dosage: '2 l/ha', method: 'Spray' },
    { product: 'Biological agent B', type: 'biological', dosage: '1 kg/ha' },
  ],
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockDetail.mockResolvedValue(DETAIL)
})

describe('catalog card screen', () => {
  it('asks the reference for the code of the route', async () => {
    await render(<CatalogDetailScreen />)
    await screen.findByText(LONG_NAME)
    expect(mockDetail).toHaveBeenCalledWith('potato__late_blight')
  })

  it('shows the name in full, with the kind, the Latin name and the danger', async () => {
    await render(<CatalogDetailScreen />)
    const name = await screen.findByText(LONG_NAME)
    // the list keeps two lines; the card does not cut the name
    expect(name.props.numberOfLines).toBeUndefined()
    expect(screen.getByText('Oomycete · Phytophthora infestans')).toBeTruthy()
    expect(screen.getByText('Dangerous')).toBeTruthy()
  })

  it('shows the sections that have a text, and skips the ones that have none', async () => {
    await render(<CatalogDetailScreen />)
    await screen.findByText(LONG_NAME)
    expect(screen.getByText('Symptoms')).toBeTruthy()
    expect(screen.getByText('Dark spots on the leaves')).toBeTruthy()
    expect(screen.getByText('White coating under the leaf')).toBeTruthy()
    expect(screen.getByText('Conditions for growth')).toBeTruthy()
    expect(screen.getByText('Humid and cool weather')).toBeTruthy()
    expect(screen.queryByText('Prevention')).toBeNull()
  })

  it('opens on the chemical treatment and has the biological one in its tab', async () => {
    await render(<CatalogDetailScreen />)
    await screen.findByText(LONG_NAME)
    expect(screen.getByText('Treatment')).toBeTruthy()
    expect(screen.getByText('Fungicide A')).toBeTruthy()
    expect(screen.queryByText('Biological agent B')).toBeNull()
    await fireEvent.press(screen.getByText('Biological'))
    expect(screen.getByText('Biological agent B')).toBeTruthy()
    expect(screen.queryByText('Fungicide A')).toBeNull()
    await fireEvent.press(screen.getByText('Chemical'))
    expect(screen.getByText('Fungicide A')).toBeTruthy()
  })

  it('always shows the safety notice above the treatment', async () => {
    await render(<CatalogDetailScreen />)
    await screen.findByText(LONG_NAME)
    expect(screen.getByText(/Check the dosage against the product label/)).toBeTruthy()
  })

  it('shows a failure with a retry that loads the card again', async () => {
    mockDetail.mockRejectedValueOnce(new Error('boom'))
    await render(<CatalogDetailScreen />)
    expect(await screen.findByText('Could not load the card from the catalog')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText(LONG_NAME)).toBeTruthy()
  })

  it('goes back with the arrow', async () => {
    await render(<CatalogDetailScreen />)
    await screen.findByText(LONG_NAME)
    await fireEvent.press(screen.getByLabelText('Back'))
    expect(mockBack).toHaveBeenCalled()
  })
})
