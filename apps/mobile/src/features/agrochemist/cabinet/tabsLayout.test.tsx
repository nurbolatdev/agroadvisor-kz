import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'

import TabsLayout from '@/app/(app)/(tabs)/_layout'
import { initI18n } from '@/i18n'

type Captured = {
  props: {
    backBehavior?: string
    tabBar: (props: object) => ReactElement
  } | null
  screens: { name: string; options?: { href?: null } }[]
  mounts: number
}

const mockCaptured: Captured = { props: null, screens: [], mounts: 0 }
let mockRoles: string[] | null = ['farmer']

jest.mock('expo-router', () => {
  const react = require('react')
  function Tabs(props: Captured['props'] & { children: unknown }) {
    react.useEffect(() => {
      mockCaptured.mounts += 1
    }, [])
    mockCaptured.props = props
    mockCaptured.screens = react.Children.toArray(props.children).map(
      (child: { props: { name: string; options?: object } }) => ({
        name: child.props.name,
        options: child.props.options,
      }),
    )
    return null
  }
  function Screen() {
    return null
  }
  Tabs.Screen = Screen
  return { Tabs, useRouter: () => ({ push: jest.fn() }) }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => {
  const useProfile = (select?: (s: object) => unknown) => {
    const state = { roles: mockRoles, phase: 'ready', error: null }
    return select ? select(state) : state
  }
  useProfile.getState = () => ({ load: jest.fn() })
  return {
    useProfile,
    useDiagnosis: { getState: () => ({ reset: jest.fn() }) },
    useSession: (select: (s: object) => unknown) => select({ logout: jest.fn() }),
  }
})

const routes = [
  { name: 'requests', key: 'k-requests' },
  { name: 'profile', key: 'k-profile' },
  { name: 'home', key: 'k-home' },
]

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  mockCaptured.props = null
  mockCaptured.screens = []
  mockCaptured.mounts = 0
  mockRoles = ['farmer']
})

function bar(activeRoute: string, navigateToTab = jest.fn()) {
  return mockCaptured.props!.tabBar({
    state: { routes, index: routes.findIndex((r) => r.name === activeRoute) },
    navigateToTab,
  })
}

describe('the tabs by role', () => {
  it('a farmer: Home first, then Profile; Requests is hidden', async () => {
    mockRoles = ['farmer']

    await render(<TabsLayout />)

    expect(mockCaptured.screens.map((s) => s.name)).toEqual(['home', 'profile', 'requests'])
    expect(mockCaptured.screens.find((s) => s.name === 'requests')?.options).toEqual({ href: null })
    expect(mockCaptured.screens.find((s) => s.name === 'home')?.options).toBeUndefined()
  })

  it('an agrochemist: Requests first, then Profile; Home is hidden', async () => {
    mockRoles = ['agrochemist']

    await render(<TabsLayout />)

    expect(mockCaptured.screens.map((s) => s.name)).toEqual(['requests', 'profile', 'home'])
    expect(mockCaptured.screens.find((s) => s.name === 'home')?.options).toEqual({ href: null })
    expect(mockCaptured.screens.find((s) => s.name === 'requests')?.options).toBeUndefined()
  })

  it('an account with both roles gets the tabs of an agrochemist', async () => {
    mockRoles = ['farmer', 'agrochemist']

    await render(<TabsLayout />)

    expect(mockCaptured.screens.map((s) => s.name)).toEqual(['requests', 'profile', 'home'])
  })

  // The first tab declared is the first route of the router; the system "Back" goes to it and then out of the
  // app. If the first route were the hidden Home, "Back" would bounce through its redirect for ever.
  it('the system Back goes to the first tab, which is a tab that can be seen', async () => {
    for (const roles of [['farmer'], ['agrochemist']]) {
      mockRoles = roles
      mockCaptured.props = null

      await render(<TabsLayout />)

      // (read through the type: the assignment above makes the compiler think it is still null)
      expect((mockCaptured as Captured).props?.backBehavior).toBe('firstRoute')
      const first = mockCaptured.screens[0]
      expect(first.options?.href).not.toBeNull()
    }
  })

  it('the tabs are built again when the answer of the server gives another role than the saved one', async () => {
    mockRoles = ['farmer']
    const view = await render(<TabsLayout />)
    expect(mockCaptured.mounts).toBe(1)

    mockRoles = ['agrochemist']
    await view.rerender(<TabsLayout />)

    expect(mockCaptured.mounts).toBe(2)
    expect(mockCaptured.screens.map((s) => s.name)).toEqual(['requests', 'profile', 'home'])
  })

  it('the tabs are not built again while the role stays the same', async () => {
    mockRoles = ['agrochemist']
    const view = await render(<TabsLayout />)

    await view.rerender(<TabsLayout />)

    expect(mockCaptured.mounts).toBe(1)
  })

  it('waits for the role: no tabs while it is not known', async () => {
    mockRoles = null

    await render(<TabsLayout />)

    expect(mockCaptured.props).toBeNull()
  })
})

describe('the bottom bar by role', () => {
  it('a farmer has Home, the camera button and Profile', async () => {
    mockRoles = ['farmer']
    await render(<TabsLayout />)

    await render(bar('home'))

    expect(screen.getByRole('tab', { name: 'Home' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Diagnose by photo' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Requests' })).toBeNull()
  })

  it('an agrochemist has Requests and Profile and no camera, no Home', async () => {
    mockRoles = ['agrochemist']
    await render(<TabsLayout />)

    await render(bar('requests'))

    expect(screen.getByRole('tab', { name: 'Requests' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Diagnose by photo' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull()
  })

  it('a tab of the bar opens the tab of the router with that name', async () => {
    mockRoles = ['agrochemist']
    await render(<TabsLayout />)
    const navigateToTab = jest.fn()

    await render(bar('requests', navigateToTab))
    await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }))

    expect(navigateToTab).toHaveBeenCalledWith('k-profile')
  })
})
