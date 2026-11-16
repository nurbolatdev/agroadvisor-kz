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

  it('provides a blur target to the content of a Screen', async () => {
    const onTarget = jest.fn()
    await render(
      <Screen>
        <Probe onTarget={onTarget} />
      </Screen>,
    )
    const target = onTarget.mock.calls[0][0]
    expect(target).toHaveProperty('current')
  })
})
