import { describe, expect, it } from 'vitest'
import { fmtAmount } from './format'

describe('fmtAmount', () => {
  it('shows thousands of UGX as full currency', () => {
    expect(fmtAmount(20, 'UGX')).toBe('20,000 UGX')
    expect(fmtAmount(2.5, 'UGX')).toBe('2,500 UGX')
    expect(fmtAmount(80, 'UGX')).toBe('80,000 UGX')
  })
  it('treats legacy k label as UGX', () => {
    expect(fmtAmount(20, 'k')).toBe('20,000 UGX')
  })
})
