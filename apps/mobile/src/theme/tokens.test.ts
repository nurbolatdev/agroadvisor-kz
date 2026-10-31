import { colors, sizes, typography } from './tokens'

describe('design tokens', () => {
  it('keep touch targets at least 48 px', () => {
    expect(sizes.touch).toBeGreaterThanOrEqual(48)
    expect(sizes.control).toBeGreaterThanOrEqual(48)
  })

  it('use six-digit HEX colors, except the translucent glass ones', () => {
    for (const [name, value] of Object.entries(colors)) {
      if (name.startsWith('glass')) {
        expect(value).toMatch(/^rgba\(/)
      } else {
        expect(value).toMatch(/^#[0-9A-F]{6}$/)
      }
    }
  })

  it('keep the line height above the font size', () => {
    for (const style of Object.values(typography)) {
      expect(style.lineHeight).toBeGreaterThan(style.fontSize)
    }
  })
})
