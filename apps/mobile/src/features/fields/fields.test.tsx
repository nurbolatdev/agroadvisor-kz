import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ApiError, NetworkError } from '@/api/errors'
import type { Field } from '@/api/fields'
import { initI18n } from '@/i18n'

import { EditFieldScreen, NewFieldScreen } from './FieldFormScreen'
import { FieldsScreen } from './FieldsScreen'
import { areaToText, fieldProblemOf, formatArea, parseArea } from './helpers'

const mockApi = {
  list: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}
const mockPush = jest.fn()
const mockBack = jest.fn()

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({ id: 'f1' }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  fieldsApi: {
    list: (...a: unknown[]) => mockApi.list(...a),
    get: (...a: unknown[]) => mockApi.get(...a),
    create: (...a: unknown[]) => mockApi.create(...a),
    update: (...a: unknown[]) => mockApi.update(...a),
    remove: (...a: unknown[]) => mockApi.remove(...a),
  },
}))

const field = (extra: Partial<Field> = {}): Field => ({
  id: 'f1',
  name: 'Tomatoes by the river',
  crop: 'tomato',
  area: 2.5,
  areaUnit: 'ha',
  areaHa: 2.5,
  location: null,
  regionId: null,
  districtId: null,
  createdAt: '2026-11-16T08:00:00Z',
  updatedAt: '2026-11-16T08:00:00Z',
  ...extra,
})

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockApi.list.mockResolvedValue([field()])
  mockApi.get.mockResolvedValue(field())
  mockApi.create.mockResolvedValue(field())
  mockApi.update.mockResolvedValue(field())
  mockApi.remove.mockResolvedValue(undefined)
})

describe('helpers', () => {
  it('reads an area with a comma or a point and refuses anything but a number above zero', () => {
    expect(parseArea('2,5')).toBe(2.5)
    expect(parseArea(' 30 ')).toBe(30)
    expect(parseArea('0')).toBeNull()
    expect(parseArea('-1')).toBeNull()
    expect(parseArea('abc')).toBeNull()
    expect(parseArea('2.5.1')).toBeNull()
    expect(parseArea('')).toBeNull()
  })

  it('writes an area for the list and for the field of the form', () => {
    expect(formatArea(2.5, 'en')).toBe('2.5')
    expect(areaToText(1200.5, 'en')).toBe('1200.5')
  })

  it('maps the answers of the server to what the screen says', () => {
    expect(fieldProblemOf(new NetworkError())).toBe('offline')
    expect(fieldProblemOf(new ApiError(404, 'field_not_found', 'x'))).toBe('notFound')
    expect(fieldProblemOf(new ApiError(400, 'validation_failed', 'x'))).toBe('invalid')
    expect(fieldProblemOf(new ApiError(429, 'rate_limited', 'x'))).toBe('rateLimited')
    expect(fieldProblemOf(new ApiError(500, 'x', 'x'))).toBe('server')
  })
})

describe('fields screen', () => {
  it('lists the fields with the crop and the area, and opens one', async () => {
    await render(<FieldsScreen />)

    expect(await screen.findByText('Tomatoes by the river')).toBeTruthy()
    expect(screen.getByText('Tomato · 2.5 ha')).toBeTruthy()
    await fireEvent.press(screen.getByText('Tomatoes by the river'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/fields/[id]', params: { id: 'f1' } })
  })

  it('adds a field from the plus button', async () => {
    await render(<FieldsScreen />)
    await screen.findByText('Tomatoes by the river')

    await fireEvent.press(screen.getByRole('button', { name: 'Add a field' }))

    expect(mockPush).toHaveBeenCalledWith('/fields/new')
  })

  it('invites to add the first field', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<FieldsScreen />)

    expect(await screen.findByText('No fields yet')).toBeTruthy()
  })

  it('shows the error with a retry', async () => {
    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await render(<FieldsScreen />)

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('Tomatoes by the river')).toBeTruthy()
  })
})

describe('new field screen', () => {
  async function fill(name: string, area: string) {
    await fireEvent.changeText(screen.getByLabelText('Name'), name)
    await fireEvent.press(screen.getByText('Tomato'))
    await fireEvent.changeText(screen.getByLabelText('Area'), area)
  }

  it('sends the name, the crop and the area in the chosen unit, then goes back', async () => {
    await render(<NewFieldScreen />)
    await fill('  Tomatoes  ', '2,5')
    await fireEvent.press(screen.getByText('sotka'))

    await fireEvent.press(screen.getByText('Save the field'))

    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    expect(mockApi.create).toHaveBeenCalledWith({
      name: 'Tomatoes',
      crop: 'tomato',
      area: 2.5,
      areaUnit: 'sotka',
    })
  })

  it('asks for what is missing before any request', async () => {
    await render(<NewFieldScreen />)

    await fireEvent.press(screen.getByText('Save the field'))
    expect(await screen.findByText('Enter a name (up to 80 characters)')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Field')
    await fireEvent.press(screen.getByText('Save the field'))
    expect(await screen.findByText('Choose a crop')).toBeTruthy()

    await fireEvent.press(screen.getByText('Wheat'))
    await fireEvent.changeText(screen.getByLabelText('Area'), '0')
    await fireEvent.press(screen.getByText('Save the field'))
    expect(await screen.findByText('Enter an area above zero, for example 2.5')).toBeTruthy()
    expect(mockApi.create).not.toHaveBeenCalled()
  })

  it('keeps the form and says why when the field was not saved', async () => {
    mockApi.create.mockRejectedValue(new NetworkError())
    await render(<NewFieldScreen />)
    await fill('Tomatoes', '2')

    await fireEvent.press(screen.getByText('Save the field'))

    expect(
      await screen.findByText('No connection to the server. The field was not saved'),
    ).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name').props.value).toBe('Tomatoes')
  })
})

describe('edit field screen', () => {
  it('shows the field in the form and saves the changes', async () => {
    await render(<EditFieldScreen />)

    expect(await screen.findByDisplayValue('Tomatoes by the river')).toBeTruthy()
    expect(screen.getByDisplayValue('2.5')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Renamed')
    await fireEvent.press(screen.getByText('Save'))

    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    expect(mockApi.update).toHaveBeenCalledWith('f1', {
      name: 'Renamed',
      crop: 'tomato',
      area: 2.5,
      areaUnit: 'ha',
    })
  })

  it('deletes only after the person confirms', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    await render(<EditFieldScreen />)
    await fireEvent.press(await screen.findByText('Delete the field'))

    expect(mockApi.remove).not.toHaveBeenCalled()
    const buttons = alert.mock.calls[0][2] ?? []
    await buttons.find((b) => b.style === 'destructive')?.onPress?.()

    await waitFor(() => expect(mockApi.remove).toHaveBeenCalledWith('f1'))
    expect(mockBack).toHaveBeenCalled()
    alert.mockRestore()
  })

  it('says so when the field does not exist', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'field_not_found', 'none'))
    await render(<EditFieldScreen />)

    expect(await screen.findByText('Field not found')).toBeTruthy()
  })
})
