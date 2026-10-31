import { fireEvent, render, screen } from '@testing-library/react-native'
import { Leaf } from 'lucide-react-native'

import { initI18n } from '@/i18n'

import { Badge } from './Badge'
import { Button } from './Button'
import { Chip } from './Chip'
import { Input } from './Input'
import { clampProgress, ProgressBar } from './ProgressBar'
import { EmptyState, ErrorState } from './StateView'

beforeAll(() => {
  initI18n('en')
})

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn()
    await render(<Button label="Save" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled or loading', async () => {
    const onPress = jest.fn()
    const { rerender } = await render(<Button label="Save" onPress={onPress} disabled />)
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await rerender(<Button label="Save" onPress={onPress} loading />)
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with an icon', async () => {
    await render(
      <Button label="Scan" onPress={jest.fn()} icon={Leaf} variant="secondary" compact />,
    )
    expect(screen.getByText('Scan')).toBeTruthy()
  })
})

describe('Input', () => {
  it('shows the error text', async () => {
    await render(<Input label="Phone" error="Required" />)
    expect(screen.getByText('Required')).toBeTruthy()
  })

  it('passes changes through', async () => {
    const onChangeText = jest.fn()
    await render(<Input label="Phone" onChangeText={onChangeText} />)
    await fireEvent.changeText(screen.getByLabelText('Phone'), '777')
    expect(onChangeText).toHaveBeenCalledWith('777')
  })
})

describe('Chip', () => {
  it('reports selected state and presses', async () => {
    const onPress = jest.fn()
    await render(<Chip label="Potato" selected onPress={onPress} />)
    const chip = screen.getByRole('button', { name: 'Potato' })
    expect(chip.props.accessibilityState).toEqual({ selected: true })
    await fireEvent.press(chip)
    expect(onPress).toHaveBeenCalled()
  })
})

describe('Badge', () => {
  it('always shows the status as text', async () => {
    await render(<Badge label="Healthy" tone="success" icon={Leaf} />)
    expect(screen.getByText('Healthy')).toBeTruthy()
  })
})

describe('ProgressBar', () => {
  it('clamps the value to 0..1', () => {
    expect(clampProgress(-1)).toBe(0)
    expect(clampProgress(2)).toBe(1)
    expect(clampProgress(Number.NaN)).toBe(0)
    expect(clampProgress(0.4)).toBe(0.4)
  })

  it('exposes the percentage to accessibility', async () => {
    await render(<ProgressBar value={0.87} />)
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(87)
  })
})

describe('states', () => {
  it('shows the default empty text', async () => {
    await render(<EmptyState />)
    expect(screen.getByText('Nothing here yet')).toBeTruthy()
  })

  it('offers a retry on error', async () => {
    const onRetry = jest.fn()
    await render(<ErrorState onRetry={onRetry} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
