import { fireEvent, render, screen } from '@testing-library/react-native'

import { initI18n } from '@/i18n'

import { DiagnosisListItem } from './DiagnosisListItem'

beforeAll(() => {
  initI18n('en')
})

const photo = {
  uri: 'https://api.example.kz/api/diagnoses/a/photo',
  headers: { Authorization: 'Bearer t' },
}

function item(over: Partial<React.ComponentProps<typeof DiagnosisListItem>> = {}) {
  return (
    <DiagnosisListItem
      title="Late blight"
      subtitle="Tomato · 4 Nov · 87%"
      badge={{ label: 'Disease', variant: 'disease' }}
      photo={photo}
      onPress={jest.fn()}
      {...over}
    />
  )
}

describe('DiagnosisListItem', () => {
  it('shows the title, the subtitle and the status', async () => {
    await render(item())

    expect(screen.getByText('Late blight')).toBeTruthy()
    expect(screen.getByText('Tomato · 4 Nov · 87%')).toBeTruthy()
    expect(screen.getByText('Disease')).toBeTruthy()
  })

  it('opens the diagnosis on press', async () => {
    const onPress = jest.fn()
    await render(item({ onPress }))

    await fireEvent.press(screen.getByRole('button'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('asks for the photo with the access token', async () => {
    await render(item())

    expect(screen.getByTestId('photo-image').props.source).toEqual({
      uri: photo.uri,
      headers: photo.headers,
    })
  })

  it('shows a leaf instead of a photo that cannot be asked for', async () => {
    await render(item({ photo: null }))

    expect(screen.queryByTestId('photo-placeholder')).toBeTruthy()
    expect(screen.queryByTestId('photo-image')).toBeNull()
  })

  it('falls back to the leaf when the photo fails to load, and stays usable', async () => {
    const onPress = jest.fn()
    await render(item({ onPress }))

    await fireEvent(screen.getByTestId('photo-image'), 'error')

    expect(screen.queryByTestId('photo-placeholder')).toBeTruthy()
    expect(screen.queryByTestId('photo-image')).toBeNull()
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('asks for the photo again when the access token was renewed after a failure', async () => {
    const { rerender } = await render(item())
    await fireEvent(screen.getByTestId('photo-image'), 'error')
    expect(screen.queryByTestId('photo-image')).toBeNull()

    // the same address, the same token: still no second request
    await rerender(item())
    expect(screen.queryByTestId('photo-image')).toBeNull()

    await rerender(item({ photo: { ...photo, headers: { Authorization: 'Bearer renewed' } } }))

    expect(screen.getByTestId('photo-image').props.source.headers).toEqual({
      Authorization: 'Bearer renewed',
    })
  })

  it('describes the line for a screen reader', async () => {
    await render(item())

    expect(screen.getByLabelText('Late blight. Tomato · 4 Nov · 87%')).toBeTruthy()
  })
})
