import { fireEvent, render, screen } from '@testing-library/react-native'

import { initI18n } from '@/i18n'

import { BottomBar } from './BottomBar'
import { TAB_SLOTS, type TabSlot, visibleSlots } from './tabSlots'

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

beforeAll(() => {
  initI18n('en')
})

describe('the places of the bottom bar', () => {
  it('are five, in the order of the design: Home, Community, camera, Chats, Profile', () => {
    expect(TAB_SLOTS.map((s) => s.id)).toEqual(['home', 'community', 'camera', 'chats', 'profile'])
  })

  it('show only what is built: Home and the camera button for now, no stubs', () => {
    expect(visibleSlots().map((s) => s.id)).toEqual(['home', 'camera'])
  })

  it('keep the order of the design when more sections get ready', () => {
    const all = TAB_SLOTS.map((s) => ({ ...s, implemented: true }))
    expect(visibleSlots(all).map((s) => s.id)).toEqual([
      'home',
      'community',
      'camera',
      'chats',
      'profile',
    ])
  })

  it('give every route place a route and every action none', () => {
    for (const slot of TAB_SLOTS) {
      if (slot.kind === 'route') expect(slot.route).toBeTruthy()
      else expect(slot.route).toBeUndefined()
    }
  })
})

describe('BottomBar', () => {
  const noop = () => undefined

  it('draws the ready places only, with their words', async () => {
    await render(<BottomBar activeRoute="home" onNavigate={noop} onCamera={noop} />)

    expect(screen.getByRole('tab', { name: 'Home' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Diagnose by photo' })).toBeTruthy()
    expect(screen.queryByText('Community')).toBeNull()
    expect(screen.queryByText('Chats')).toBeNull()
    expect(screen.queryByText('Profile')).toBeNull()
    expect(screen.queryByText(/soon/i)).toBeNull()
  })

  it('marks the open tab', async () => {
    await render(<BottomBar activeRoute="home" onNavigate={noop} onCamera={noop} />)

    expect(screen.getByRole('tab', { name: 'Home' })).toHaveProp('accessibilityState', {
      selected: true,
    })
  })

  it('opens a tab on press and starts a diagnosis with the camera button', async () => {
    const onNavigate = jest.fn()
    const onCamera = jest.fn()
    await render(<BottomBar activeRoute="other" onNavigate={onNavigate} onCamera={onCamera} />)

    await fireEvent.press(screen.getByRole('tab', { name: 'Home' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Diagnose by photo' }))

    expect(onNavigate).toHaveBeenCalledWith('home')
    expect(onCamera).toHaveBeenCalledTimes(1)
  })

  it('draws a place as soon as its section is switched on', async () => {
    const slots: TabSlot[] = TAB_SLOTS.map((s) =>
      s.id === 'profile' ? { ...s, implemented: true } : s,
    )
    await render(<BottomBar activeRoute="home" onNavigate={noop} onCamera={noop} slots={slots} />)

    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy()
  })
})
