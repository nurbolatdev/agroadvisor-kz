import { fireEvent, render, screen } from '@testing-library/react-native'

import { initI18n } from '@/i18n'

import { LanguageList } from './LanguageList'

beforeAll(() => {
  initI18n('en')
})

describe('language list', () => {
  it('has the three languages in the order of the design, each with a line in the other languages', async () => {
    await render(<LanguageList value="ru" onSelect={jest.fn()} />)

    const rows = screen.getAllByRole('radio')

    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Қазақша. Kazakh',
      'Русский. Russian',
      'English. Ағылшынша · Английский',
    ])
  })

  it('marks the chosen language, and only it', async () => {
    await render(<LanguageList value="ru" onSelect={jest.fn()} />)

    expect(screen.getByRole('radio', { name: /^Русский/, checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('tells which language was tapped', async () => {
    const onSelect = jest.fn()
    await render(<LanguageList value="ru" onSelect={onSelect} />)

    await fireEvent.press(screen.getByRole('radio', { name: /^Қазақша/ }))

    expect(onSelect).toHaveBeenCalledWith('kk')
  })

  it('tells about the chosen one too, so a tap on it is not lost', async () => {
    const onSelect = jest.fn()
    await render(<LanguageList value="ru" onSelect={onSelect} />)

    await fireEvent.press(screen.getByRole('radio', { name: /^Русский/ }))

    expect(onSelect).toHaveBeenCalledWith('ru')
  })

  it('shows the language names the same whatever language the app shows', async () => {
    initI18n('kk')
    await render(<LanguageList value="kk" onSelect={jest.fn()} />)

    expect(screen.getByText('Русский')).toBeTruthy()
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('Қазақша')).toBeTruthy()
    initI18n('en')
  })
})
