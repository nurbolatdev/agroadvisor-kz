import { fireEvent, render, screen } from '@testing-library/react-native'

import type { DiseaseSummary } from '@/api/diseases'
import { NetworkError } from '@/api/errors'
import CatalogScreen from '@/app/(app)/catalog'
import { initI18n } from '@/i18n'

const mockList = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { language: string }) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => ({
  // looked up at call time: this factory runs when the screen is imported, before `mockList` exists
  diseaseCatalog: { list: (...args: unknown[]) => mockList(...args) },
}))

const ITEMS: DiseaseSummary[] = [
  {
    code: 'potato__late_blight',
    cropCode: 'potato',
    kind: 'oomycete',
    severity: 'high',
    name: 'Potato late blight',
    latinName: 'Phytophthora infestans',
  },
  {
    code: 'tomato__leaf_mold',
    cropCode: 'tomato',
    kind: 'fungal',
    severity: 'low',
    name: 'Tomato leaf mold',
  },
  {
    code: 'potato__colorado_beetle',
    cropCode: 'potato',
    kind: 'pest',
    severity: 'medium',
    name: 'Colorado potato beetle',
  },
  { code: 'potato__healthy', cropCode: 'potato', kind: 'healthy', severity: null, name: 'Healthy' },
]

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockList.mockResolvedValue(ITEMS)
})

async function openScreen() {
  await render(<CatalogScreen />)
  await screen.findByText('Potato late blight')
}

describe('catalog screen', () => {
  it('shows the diseases first, with the danger in words, and no pests or healthy leaves', async () => {
    await openScreen()
    expect(screen.getByText('Tomato leaf mold')).toBeTruthy()
    expect(screen.getByText('Dangerous')).toBeTruthy()
    expect(screen.getByText('Low')).toBeTruthy()
    expect(screen.queryByText('Colorado potato beetle')).toBeNull()
    expect(screen.queryByText('Healthy')).toBeNull()
  })

  it('writes the kind and the Latin name on the second line', async () => {
    await openScreen()
    expect(screen.getByText('Oomycete · Phytophthora infestans')).toBeTruthy()
    expect(screen.getByText('Fungal')).toBeTruthy()
  })

  it('asks the reference once, for every crop', async () => {
    await openScreen()
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockList).toHaveBeenCalledWith()
  })

  it('keeps one crop when its chip is chosen, and brings all back with "All"', async () => {
    await openScreen()
    await fireEvent.press(screen.getByText('Potatoes'))
    expect(screen.getByText('Potato late blight')).toBeTruthy()
    expect(screen.queryByText('Tomato leaf mold')).toBeNull()
    await fireEvent.press(screen.getByText('All'))
    expect(screen.getByText('Tomato leaf mold')).toBeTruthy()
    // the filters work on the phone: no second request
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('switches to the pests', async () => {
    await openScreen()
    await fireEvent.press(screen.getByText('Pests'))
    expect(screen.getByText('Colorado potato beetle')).toBeTruthy()
    expect(screen.getByText('Moderate')).toBeTruthy()
    expect(screen.queryByText('Potato late blight')).toBeNull()
    await fireEvent.press(screen.getByText('Diseases'))
    expect(screen.getByText('Potato late blight')).toBeTruthy()
  })

  it('says nothing was found, and the clear button brings the list back', async () => {
    await openScreen()
    await fireEvent.changeText(screen.getByLabelText('Disease or pest'), 'qqq')
    expect(screen.getByText('Nothing found')).toBeTruthy()
    expect(screen.getByText('Change the search or pick another crop')).toBeTruthy()
    expect(screen.queryByText('Potato late blight')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Clear search'))
    expect(screen.getByText('Potato late blight')).toBeTruthy()
    expect(screen.queryByText('Nothing found')).toBeNull()
  })

  it('searches by the Latin name', async () => {
    await openScreen()
    await fireEvent.changeText(screen.getByLabelText('Disease or pest'), 'phytoph')
    expect(screen.getByText('Potato late blight')).toBeTruthy()
    expect(screen.queryByText('Tomato leaf mold')).toBeNull()
  })

  it('has no clear button while the field is empty', async () => {
    await openScreen()
    expect(screen.queryByLabelText('Clear search')).toBeNull()
  })

  it('opens the card of the entry that was tapped', async () => {
    await openScreen()
    await fireEvent.press(screen.getByText('Tomato leaf mold'))
    expect(mockPush).toHaveBeenCalledWith('/catalog/tomato__leaf_mold')
  })

  it('goes back with the arrow', async () => {
    await openScreen()
    await fireEvent.press(screen.getByLabelText('Back'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows a failure of the network with a retry that loads the list', async () => {
    mockList.mockRejectedValueOnce(new NetworkError())
    await render(<CatalogScreen />)
    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('Potato late blight')).toBeTruthy()
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('shows another text when the server fails', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'))
    await render(<CatalogScreen />)
    expect(await screen.findByText('The server did not answer. Try again')).toBeTruthy()
  })
})
