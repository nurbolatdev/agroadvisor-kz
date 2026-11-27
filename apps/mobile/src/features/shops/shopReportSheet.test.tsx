import { fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { ShopReportSheet } from './ShopReportSheet'

const mockReport = jest.fn()

jest.mock('@/services', () => ({
  shopsApi: { report: (body: unknown) => mockReport(body) },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

const point = { latitude: 43.25, longitude: 76.9 }

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockReport.mockReset()
  mockReport.mockResolvedValue({ id: 'r1' })
})

describe('ShopReportSheet', () => {
  it('sends the reason, the comment and the shop, without a point', async () => {
    await render(<ShopReportSheet target={{ kind: 'shop', shopId: 's1' }} onClose={jest.fn()} />)
    await fireEvent.press(screen.getByText('Shop is closed'))
    await fireEvent.changeText(screen.getByPlaceholderText('Describe the mistake'), '  Closed  ')
    await fireEvent.press(screen.getByText('Send'))
    expect(await screen.findByText('Report sent')).toBeTruthy()
    expect(mockReport).toHaveBeenCalledWith({ type: 'closed', comment: 'Closed', shopId: 's1' })
  })

  it('sends a new shop with the point of the farmer and no shop id', async () => {
    await render(<ShopReportSheet target={{ kind: 'new', point }} onClose={jest.fn()} />)
    expect(screen.getByText('Suggest a shop')).toBeTruthy()
    await fireEvent.changeText(
      screen.getByPlaceholderText('Name and address of the shop'),
      'Berekе, Tole bi 45',
    )
    await fireEvent.press(screen.getByText('Send'))
    await screen.findByText('Report sent')
    expect(mockReport).toHaveBeenCalledWith({
      type: 'new_shop',
      comment: 'Berekе, Tole bi 45',
      latitude: 43.25,
      longitude: 76.9,
    })
  })

  it('keeps the send button off until the comment is written', async () => {
    await render(<ShopReportSheet target={{ kind: 'new', point }} onClose={jest.fn()} />)
    await fireEvent.changeText(screen.getByPlaceholderText('Name and address of the shop'), '   ')
    await fireEvent.press(screen.getByText('Send'))
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('needs a reason for a report on a shop', async () => {
    await render(<ShopReportSheet target={{ kind: 'shop', shopId: 's1' }} onClose={jest.fn()} />)
    await fireEvent.changeText(screen.getByPlaceholderText('Describe the mistake'), 'Wrong phone')
    await fireEvent.press(screen.getByText('Send'))
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('says that the limit of reports is reached', async () => {
    mockReport.mockRejectedValue(new ApiError(429, 'rate_limited', 'too many'))
    await render(<ShopReportSheet target={{ kind: 'new', point }} onClose={jest.fn()} />)
    await fireEvent.changeText(screen.getByPlaceholderText('Name and address of the shop'), 'Shop')
    await fireEvent.press(screen.getByText('Send'))
    expect(await screen.findByText('Too many reports. Try again in an hour')).toBeTruthy()
  })

  it('says that the shop is no longer shown', async () => {
    mockReport.mockRejectedValue(new ApiError(404, 'shop_not_found', 'gone'))
    await render(<ShopReportSheet target={{ kind: 'shop', shopId: 's1' }} onClose={jest.fn()} />)
    await fireEvent.press(screen.getByText('Wrong data'))
    await fireEvent.changeText(screen.getByPlaceholderText('Describe the mistake'), 'Phone')
    await fireEvent.press(screen.getByText('Send'))
    expect(await screen.findByText('The shop is no longer shown')).toBeTruthy()
  })
})
