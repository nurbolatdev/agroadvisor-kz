import type { DiagnosisPhase } from '@/store/diagnosis'

export type StepKey = 'prepare' | 'analyze' | 'done'
export type StepState = 'pending' | 'current' | 'done'

export const STEPS: readonly StepKey[] = ['prepare', 'analyze', 'done']

// The steps the screen shows. Only what the app really knows is shown: compressing the photo, then
// one request that sends it and waits for the model (the server does not report its progress).
export function stepStates(phase: DiagnosisPhase): Record<StepKey, StepState> {
  switch (phase) {
    case 'preparing':
      return { prepare: 'current', analyze: 'pending', done: 'pending' }
    case 'sending':
    case 'failed':
      return { prepare: 'done', analyze: 'current', done: 'pending' }
    case 'done':
      return { prepare: 'done', analyze: 'done', done: 'done' }
    default:
      return { prepare: 'pending', analyze: 'pending', done: 'pending' }
  }
}

// 0..1 for the progress bar
export function progressOf(phase: DiagnosisPhase): number {
  const states = stepStates(phase)
  const done = STEPS.filter((key) => states[key] === 'done').length
  const current = STEPS.some((key) => states[key] === 'current') ? 0.5 : 0
  return (done + current) / STEPS.length
}
