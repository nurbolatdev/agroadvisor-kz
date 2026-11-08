import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { Keyboard, Pressable } from 'react-native'

import { NetworkError } from '@/api/errors'
import { createMockRegionsApi } from '@/api/mock/regions'
import type { RegionsApi } from '@/api/regions'
import { initI18n } from '@/i18n'

import { RegionField } from './RegionField'

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

beforeAll(() => {
  initI18n('en')
})

function Harness({ api, onChange }: { api: RegionsApi; onChange?: (id: number | null) => void }) {
  const [value, setValue] = useState<{ id: number; name: string } | null>(null)
  return (
    <RegionField
      api={api}
      language="en"
      value={value}
      onChange={(region) => {
        setValue(region)
        onChange?.(region?.id ?? null)
      }}
    />
  )
}

describe('the region field of the registration form', () => {
  it('shows the placeholder and asks for the list only when the sheet is opened', async () => {
    const api = createMockRegionsApi({ delayMs: 0 })
    const list = jest.spyOn(api, 'list')

    await render(<Harness api={api} />)

    expect(screen.getByText('Choose a region')).toBeTruthy()
    expect(list).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))
    expect(await screen.findByText('Kostanay Region')).toBeTruthy()
    expect(list).toHaveBeenCalledWith('en')
  })

  it('picking a region closes the sheet and shows its name on the row', async () => {
    const onChange = jest.fn()
    await render(<Harness api={createMockRegionsApi({ delayMs: 0 })} onChange={onChange} />)
    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))

    await fireEvent.press(await screen.findByRole('radio', { name: 'Turkistan Region' }))

    expect(onChange).toHaveBeenCalledWith(10)
    expect(screen.getByRole('button', { name: 'Region. Turkistan Region' })).toBeTruthy()
    expect(screen.queryByText('Kostanay Region')).toBeNull() // the sheet is closed
  })

  it('closes the keyboard of the field typed in before, so it does not cover the list', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss')
    await render(<Harness api={createMockRegionsApi({ delayMs: 0 })} />)

    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))

    expect(dismiss).toHaveBeenCalled()
    dismiss.mockRestore()
    await screen.findByText('Kostanay Region')
  })

  it('opening the sheet again does not read the list again', async () => {
    const list = jest.fn(createMockRegionsApi({ delayMs: 0 }).list)
    await render(<Harness api={{ list }} />)
    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Akmola Region' })) // closes the sheet

    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))

    expect(await screen.findByRole('radio', { name: 'Kostanay Region' })).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('reads the list again when the language changed, and the answer for the old language is dropped', async () => {
    const answers: Record<string, (v: { id: number; code: string; name: string }[]) => void> = {}
    const list = jest.fn(
      (lang: string) =>
        new Promise<{ id: number; code: string; name: string }[]>((resolve) => {
          answers[lang] = resolve
        }),
    )
    function Switching() {
      const [language, setLanguage] = useState<'en' | 'ru'>('en')
      return (
        <>
          <RegionField
            api={{ list } as RegionsApi}
            language={language}
            value={null}
            onChange={() => {}}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="switch"
            onPress={() => setLanguage('ru')}
          />
        </>
      )
    }
    await render(<Switching />)
    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))
    await waitFor(() => expect(list).toHaveBeenCalledWith('en'))

    await fireEvent.press(screen.getByLabelText('switch'))
    await waitFor(() => expect(list).toHaveBeenCalledWith('ru'))
    answers.ru([{ id: 1, code: 'akmola', name: 'Акмолинская область' }])
    expect(await screen.findByText('Акмолинская область')).toBeTruthy()
    answers.en([{ id: 1, code: 'akmola', name: 'Akmola Region' }]) // late answer for the language left

    await waitFor(() => expect(screen.queryByText('Akmola Region')).toBeNull())
    expect(screen.getByText('Акмолинская область')).toBeTruthy()
  })

  it('"Prefer not to say" clears the choice: the field is optional', async () => {
    const onChange = jest.fn()
    await render(<Harness api={createMockRegionsApi({ delayMs: 0 })} onChange={onChange} />)
    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Akmola Region' }))
    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))

    await fireEvent.press(await screen.findByRole('radio', { name: 'Prefer not to say' }))

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByText('Choose a region')).toBeTruthy()
  })

  it('a list that cannot be loaded says so and tries again on request', async () => {
    const list = jest.fn(createMockRegionsApi({ delayMs: 0 }).list)
    list.mockRejectedValueOnce(new NetworkError()) // the first read gets no answer
    await render(<Harness api={{ list }} />)

    await fireEvent.press(screen.getByRole('button', { name: /Region/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Kostanay Region')).toBeTruthy()
  })
})
