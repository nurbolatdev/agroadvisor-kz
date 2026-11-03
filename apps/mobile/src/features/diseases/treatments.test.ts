import type { Treatment } from '@/api/diseases'

import { defaultTab, groupTreatments } from './treatments'

const chemical = (product: string): Treatment => ({ product, type: 'chemical' })
const biological = (product: string): Treatment => ({ product, type: 'biological' })

describe('treatment plan', () => {
  it('splits the treatments by type and keeps their order', () => {
    const plan = groupTreatments([chemical('a'), biological('b'), chemical('c')])
    expect(plan.chemical.map((t) => t.product)).toEqual(['a', 'c'])
    expect(plan.biological.map((t) => t.product)).toEqual(['b'])
  })

  it('is empty for no treatments', () => {
    expect(groupTreatments([])).toEqual({ chemical: [], biological: [] })
  })

  it('opens the chemical tab first, the biological one only when it is the only one with content', () => {
    expect(defaultTab(groupTreatments([chemical('a'), biological('b')]))).toBe('chemical')
    expect(defaultTab(groupTreatments([biological('b')]))).toBe('biological')
    expect(defaultTab(groupTreatments([]))).toBe('chemical')
  })
})
