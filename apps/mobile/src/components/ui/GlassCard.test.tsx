import { render, screen } from '@testing-library/react-native'
import { type ComponentRef, createRef } from 'react'
import { Text, View } from 'react-native'

import { BlurTargetProvider, useBlurTarget } from './blurTarget'
import { GlassCard } from './GlassCard'
import { Screen } from './Screen'

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

// Records the props every BlurView gets, so the test can see which blurTarget a card passes on.
const mockBlurProps: { blurTarget?: unknown }[] = []
jest.mock('expo-blur', () => {
  const { View } = require('react-native')
  return {
    BlurView: (props: { blurTarget?: unknown }) => {
      mockBlurProps.push(props)
      return <View />
    },
    BlurTargetView: View,
  }
})

beforeEach(() => {
  mockBlurProps.length = 0
})

function Probe({ onTarget }: { onTarget: (target: unknown) => void }) {
  onTarget(useBlurTarget())
  return null
}

describe('GlassCard and Screen', () => {
  it('renders the card content', async () => {
    await render(
      <GlassCard>
        <Text>Inside</Text>
      </GlassCard>,
    )
    expect(screen.getByText('Inside')).toBeTruthy()
  })

  it('exposes no blur target outside a Screen or provider', async () => {
    const onTarget = jest.fn()
    await render(<Probe onTarget={onTarget} />)
    expect(onTarget).toHaveBeenCalledWith(undefined)
  })

  it('shares the provided blur target with descendants', async () => {
    const ref = createRef<ComponentRef<typeof View>>()
    const onTarget = jest.fn()
    await render(
      <BlurTargetProvider value={ref}>
        <Probe onTarget={onTarget} />
      </BlurTargetProvider>,
    )
    expect(onTarget).toHaveBeenCalledWith(ref)
  })

  it('hands the Screen blur target to the BlurView of a card', async () => {
    const onTarget = jest.fn()
    await render(
      <Screen>
        <Probe onTarget={onTarget} />
        <GlassCard>
          <Text>Inside</Text>
        </GlassCard>
      </Screen>,
    )
    const screenTarget = onTarget.mock.calls[0][0]
    expect(mockBlurProps.at(-1)?.blurTarget).toBe(screenTarget)
    expect(screenTarget.current).not.toBeNull()
  })

  it('prefers an explicit blurTarget over the Screen one', async () => {
    const own = createRef<ComponentRef<typeof View>>()
    await render(
      <Screen>
        <GlassCard blurTarget={own}>
          <Text>Inside</Text>
        </GlassCard>
      </Screen>,
    )
    expect(mockBlurProps.at(-1)?.blurTarget).toBe(own)
  })
})
