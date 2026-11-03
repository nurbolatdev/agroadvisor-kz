import { progressOf, stepStates } from './steps'

describe('analysis steps', () => {
  it('shows the photo preparation first', () => {
    expect(stepStates('preparing')).toEqual({
      prepare: 'current',
      analyze: 'pending',
      done: 'pending',
    })
  })

  it('shows one combined step while the request is in flight, and keeps it after a failure', () => {
    const waiting = { prepare: 'done', analyze: 'current', done: 'pending' }
    expect(stepStates('sending')).toEqual(waiting)
    expect(stepStates('failed')).toEqual(waiting)
  })

  it('shows everything done at the end', () => {
    expect(stepStates('done')).toEqual({ prepare: 'done', analyze: 'done', done: 'done' })
  })

  it('moves the progress forward with the phases', () => {
    const values = (['idle', 'preparing', 'sending', 'done'] as const).map(progressOf)
    expect(values[0]).toBe(0)
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(values[3]).toBe(1)
  })
})
