import { colors, sizes, typography } from './tokens'

describe('design tokens', () => {
  it('keep touch targets at least 48 px', () => {
    expect(sizes.touch).toBeGreaterThanOrEqual(48)
    expect(sizes.control).toBeGreaterThanOrEqual(48)
  })

  it('use six-digit HEX colors', () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('keep the line height above the font size', () => {
    for (const style of Object.values(typography)) {
      expect(style.lineHeight).toBeGreaterThan(style.fontSize)
    }
  })
})
