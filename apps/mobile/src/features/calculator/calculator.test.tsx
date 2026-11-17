import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native'

import { ApiError, NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { CalculatorScreen } from './CalculatorScreen'
import { ResultScreen } from './ResultScreen'
import { type CalculatorForm, emptyForm, inputsOf, useCalculator } from './store'

describe('inputsOf', () => {
  const base: CalculatorForm = {
    season: 2026,
    crop: 'wheat',
    area: '57',
    areaUnit: 'sotka',
    yieldCHa: '18',
    priceT: '95000',
    perHa: ['', '', '', '', '', ''],
  }

  it('rounds the area to the 4 decimals the server takes (57 sotki are 0.57 ha)', () => {
    expect(inputsOf(base)?.areaHa).toBe(0.57)
    expect(inputsOf({ ...base, area: '113' })?.areaHa).toBe(1.13)
  })

  it('refuses what the server would answer 400 to', () => {
    expect(inputsOf({ ...base, area: '10001', areaUnit: 'ha' })).toBeNull()
    expect(inputsOf({ ...base, area: '0.00001', areaUnit: 'ha' })).toBeNull()
    expect(inputsOf({ ...base, yieldCHa: '18.123' })).toBeNull()
    expect(inputsOf({ ...base, priceT: '95000.555' })).toBeNull()
    expect(inputsOf({ ...base, yieldCHa: '10001' })).toBeNull()
  })
})

const mockCalculations = { list: jest.fn(), create: jest.fn(), remove: jest.fn() }
const mockBack = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ back: mockBack, push: mockPush }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  calculationsApi: {
    list: (...a: unknown[]) => mockCalculations.list(...a),
    create: (...a: unknown[]) => mockCalculations.create(...a),
    remove: (...a: unknown[]) => mockCalculations.remove(...a),
  },
}))

// the numbers of frames 30 and 31
const frame: CalculatorForm = {
  season: 2026,
  crop: 'wheat',
  area: '50',
  areaUnit: 'ha',
  yieldCHa: '18',
  priceT: '95000',
  perHa: ['28000', '35000', '18000', '32000', '15000', '12000'],
}

// the first frame of a screen is empty until the texts are ready: wait for the content
async function render(ui: React.ReactElement) {
  await rtlRender(ui)
  await waitFor(() => expect(screen.toJSON()).not.toBeNull())
}

// the store is set before a screen is rendered: no React scope is needed (the act of the library is async)
const act = (change: () => void) => change()

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockCalculations.list.mockReset().mockResolvedValue([])
  mockCalculations.create.mockReset().mockResolvedValue({ id: 'c1' })
  mockCalculations.remove.mockReset().mockResolvedValue(undefined)
  mockBack.mockReset()
  mockPush.mockReset()
  act(() => useCalculator.getState().replace(emptyForm(2026)))
})

describe('CalculatorScreen', () => {
  it('shows the totals of the costs while the farmer types', async () => {
    await render(<CalculatorScreen />)

    await fireEvent.changeText(screen.getByTestId('calculator-area'), '50')
    await fireEvent.changeText(screen.getByTestId('calculator-cost-seedCost'), '28000')

    // the row of the seeds and the total show the same sum
    expect(screen.getAllByText('1,400,000 ₸')).toHaveLength(2)
    expect(screen.getByTestId('calculator-total').props.children).toBe('1,400,000 ₸')
  })

  it('does not go on while the area, the yield or the price is missing', async () => {
    await render(<CalculatorScreen />)

    await fireEvent.press(screen.getByLabelText('Calculate'))

    expect(screen.getByText('Enter an area, a yield and a price above zero')).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('opens the result when everything is typed', async () => {
    act(() => useCalculator.getState().replace(frame))
    await render(<CalculatorScreen />)

    await fireEvent.press(screen.getByLabelText('Calculate'))

    expect(mockPush).toHaveBeenCalledWith('/calculator-result')
  })

  it('takes the area in sotki', async () => {
    act(() => useCalculator.getState().replace({ ...frame, area: '5000' }))
    await render(<CalculatorScreen />)

    await fireEvent.press(screen.getByLabelText('ha'))

    // 5000 sotki are 50 ha: the same costs as in the frame
    expect(screen.getByTestId('calculator-total').props.children).toBe('7,000,000 ₸')
    expect(useCalculator.getState().form.areaUnit).toBe('sotka')
  })

  it('picks the crop from the list', async () => {
    await render(<CalculatorScreen />)

    await fireEvent.press(screen.getByLabelText('Crop'))
    await fireEvent.press(screen.getByText('Potato'))

    expect(useCalculator.getState().form.crop).toBe('potato')
  })

  it('fills the form from a saved season and offers it as a chip', async () => {
    mockCalculations.list.mockResolvedValue([
      {
        id: 's1',
        crop: 'corn',
        season: 2025,
        areaHa: 10,
        areaUnit: 'ha',
        yieldCHa: 60,
        priceT: 80_000,
        costs: { seedCost: 100_000 },
        results: {},
        createdAt: '2025-11-01T00:00:00Z',
      },
    ])
    await render(<CalculatorScreen />)

    await fireEvent.press(await screen.findByText('Season 2025'))

    const form = useCalculator.getState().form
    expect(form).toMatchObject({ season: 2025, crop: 'corn', area: '10', yieldCHa: '60' })
    expect(form.perHa[0]).toBe('10000')
  })

  it('starts the next season empty', async () => {
    await render(<CalculatorScreen />)

    await fireEvent.press(screen.getByLabelText('New season'))

    expect(useCalculator.getState().form.season).toBe(2027)
  })
})

describe('ResultScreen', () => {
  beforeEach(() => {
    act(() => useCalculator.getState().replace(frame))
  })

  it('shows the profit, the cost price and the break-even of the frame', async () => {
    await render(<ResultScreen />)

    expect(screen.getByTestId('result-profit').props.children).toBe('1,550,000 ₸')
    expect(screen.getByText('Revenue 8,550,000 ₸ · profitability 22%')).toBeTruthy()
    expect(screen.getByText('77,778 ₸/t')).toBeTruthy()
    expect(screen.getByText('14.7 c/ha')).toBeTruthy()
    expect(screen.getByText('Fertilizers 25%')).toBeTruthy()
    expect(screen.getByText('Other 19%')).toBeTruthy()
  })

  it('has a loss in the title and the colour when the season is not profitable', async () => {
    act(() => useCalculator.getState().replace({ ...frame, priceT: '60000' }))
    await render(<ResultScreen />)

    expect(screen.getByText('Loss for the season')).toBeTruthy()
  })

  it('shows the loss of the scenario when the yield goes down by 20 %', async () => {
    await render(<ResultScreen />)
    const [yieldSlider] = screen.getAllByTestId('percent-slider')
    expect(screen.getByTestId('scenario-text').props.children).toContain('profit')

    for (let i = 0; i < 4; i += 1) {
      await fireEvent(yieldSlider, 'accessibilityAction', {
        nativeEvent: { actionName: 'decrement' },
      })
    }

    expect(screen.getByText('−20% · 14.4 c/ha')).toBeTruthy()
    expect(screen.getByText('−160,000 ₸ loss in this scenario')).toBeTruthy()
  })

  it('does not go beyond 30 %', async () => {
    await render(<ResultScreen />)
    const [yieldSlider] = screen.getAllByTestId('percent-slider')

    for (let i = 0; i < 10; i += 1) {
      await fireEvent(yieldSlider, 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      })
    }

    expect(screen.getByText('+30% · 23.4 c/ha')).toBeTruthy()
  })

  it('saves the season with the totals and what was calculated, and replaces the old one', async () => {
    mockCalculations.list.mockResolvedValue([{ id: 'old', season: 2026 }])
    await render(<ResultScreen />)

    await fireEvent.press(screen.getByLabelText('Save the season'))

    expect(await screen.findByText('Season saved')).toBeTruthy()
    expect(mockCalculations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        crop: 'wheat',
        season: 2026,
        areaHa: 50,
        areaUnit: 'ha',
        yieldCHa: 18,
        priceT: 95_000,
        costs: expect.objectContaining({ seedCost: 1_400_000, laborCost: 600_000 }),
        results: expect.objectContaining({ profit: 1_550_000, revenue: 8_550_000 }),
      }),
    )
    expect(mockCalculations.remove).toHaveBeenCalledWith('old')
  })

  it.each([
    [new NetworkError(), 'No connection to the server. Your calculation is kept, try again.'],
    [new ApiError(409, 'calculation_limit_reached', 'x'), 'You can keep at most 100 seasons.'],
  ])('says why saving failed and keeps the old season untouched', async (error, text) => {
    mockCalculations.create.mockRejectedValue(error)
    await render(<ResultScreen />)

    await fireEvent.press(screen.getByLabelText('Save the season'))

    expect(await screen.findByText(text)).toBeTruthy()
    await waitFor(() => expect(mockCalculations.remove).not.toHaveBeenCalled())
  })

  it('opens the agrochemists from "Discuss"', async () => {
    await render(<ResultScreen />)

    await fireEvent.press(screen.getByLabelText('Discuss'))

    expect(mockPush).toHaveBeenCalledWith('/agrochemists')
  })

  it('asks for the data first when there is none', async () => {
    act(() => useCalculator.getState().replace(emptyForm(2026)))
    await render(<ResultScreen />)

    expect(await screen.findByText('Enter the data first')).toBeTruthy()
  })
})
