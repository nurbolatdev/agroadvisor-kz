import type { DiagnosisHistoryApi, DiagnosisResult } from '@/api/diagnosis'
import { createHistoryStore } from '@/store/history'

import { onUserChange } from './userChange'

function fakes() {
  const calls: string[] = []
  return {
    calls,
    stores: {
      diagnosis: {
        clearAnswers: () => void calls.push('clearAnswers'),
        restore: () => void calls.push('restore'),
      },
      history: { reset: () => void calls.push('resetHistory') },
    },
  }
}

describe('a change of the user', () => {
  it('does nothing while the user stays the same', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: 'a' }, { userId: 'a' }, stores)

    expect(calls).toEqual([])
  })

  it.each([
    ['signs out', null],
    ['is replaced by another farmer', 'b'],
  ])('clears the answers and the history and reads the queue again when A %s', (_, next) => {
    const { calls, stores } = fakes()

    onUserChange({ userId: next }, { userId: 'a' }, stores)

    expect(calls).toEqual(['clearAnswers', 'resetHistory', 'restore'])
  })

  it('only reads the queue on the first sign-in: there is nothing to clear', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: 'a' }, { userId: null }, stores)

    expect(calls).toEqual(['restore'])
  })

  it('drops a history request that was on its way when the farmer signed out', async () => {
    let release: (page: DiagnosisResult[]) => void = () => {}
    const api: DiagnosisHistoryApi = {
      list: () => new Promise((resolve) => (release = resolve)),
      get: jest.fn(),
    }
    const history = createHistoryStore({ api, pageSize: 3 })
    const { stores } = fakes()
    const loading = history.getState().load()

    onUserChange({ userId: null }, { userId: 'a' }, { ...stores, history: history.getState() })
    release([{ id: 'of-a' } as DiagnosisResult]) // A's diagnoses arrive late
    await loading

    expect(history.getState()).toMatchObject({ items: [], phase: 'idle' })
  })
})
