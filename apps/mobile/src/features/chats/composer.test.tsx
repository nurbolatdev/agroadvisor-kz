import { fireEvent, render, screen } from '@testing-library/react-native'

import { initI18n } from '@/i18n'

import { Composer } from './Composer'

const base = { disabled: false, sending: false, onSend: jest.fn(), onEdit: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  initI18n('ru')
  base.onSend.mockResolvedValue(true)
})

describe('Composer', () => {
  it('has the attach button and the texts of the chat by default', async () => {
    const onAttach = jest.fn()
    await render(<Composer {...base} onAttach={onAttach} />)

    await fireEvent.press(screen.getByLabelText('Прикрепить фото'))
    expect(onAttach).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('Сообщение')).toBeOnTheScreen()
    expect(screen.getByLabelText('Отправить')).toBeOnTheScreen()
  })

  it('leaves out the attach button when there is no handler and takes its own texts', async () => {
    await render(<Composer {...base} placeholder="Ваш ответ…" sendLabel="Ответить" maxLength={5} />)

    expect(screen.queryByLabelText('Прикрепить фото')).not.toBeOnTheScreen()
    const field = screen.getByPlaceholderText('Ваш ответ…')
    expect(field.props.maxLength).toBe(5)
    await fireEvent.changeText(field, 'да')
    await fireEvent.press(screen.getByLabelText('Ответить'))
    expect(base.onSend).toHaveBeenCalledWith('да')
  })
})
