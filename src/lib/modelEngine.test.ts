import { describe, it, expect } from 'vitest'
import { computeProposed, aggregateReports, computeActual } from './modelEngine'
import { DEFAULT_SETTINGS } from './defaults'
import { createSampleSundays } from './sampleData'
import type { SundayReport } from './types'

const baseSettings = {
  ...DEFAULT_SETTINGS,
  deductOperatingExpenses: true,
  noDebtMode: false,
}

describe('proposed model engine — sample Sundays', () => {
  const sundays = createSampleSundays()
  const sep6 = sundays.find((s) => s.date === '2025-09-06')!
  const sep13 = sundays.find((s) => s.date === '2025-09-13')!

  it('6 Sep with ops deduct: rem70 → P30 I30 rem10 → D5 U2.5 S2.5', () => {
    const p = computeProposed(sep6, baseSettings)
    expect(p.generalOffertory).toBe(80)
    expect(p.operatingExpenses).toBe(10)
    expect(p.modeledAmount).toBe(70)
    expect(p.pastor).toBe(30)
    expect(p.instrumentalists).toBe(30)
    expect(p.debt).toBe(5)
    expect(p.ushering).toBe(2.5)
    expect(p.savings).toBe(2.5)
    expect(p.namedGifts).toBe(0)
  })

  it('13 Sep with ops deduct: rem64 → P30 I30 rem4 → D2 U1 S1', () => {
    const p = computeProposed(sep13, baseSettings)
    expect(p.generalOffertory).toBe(72)
    expect(p.operatingExpenses).toBe(8)
    expect(p.modeledAmount).toBe(64)
    expect(p.pastor).toBe(30)
    expect(p.instrumentalists).toBe(30)
    expect(p.debt).toBe(2)
    expect(p.ushering).toBe(1)
    expect(p.savings).toBe(1)
  })

  it('combined actual: income 152, P74, I60, water18, bal0', () => {
    const { actual } = aggregateReports(sundays, baseSettings)
    expect(actual.income).toBe(152)
    expect(actual.byCategory['Pastor']).toBe(74)
    expect(actual.byCategory['Instrumentalists']).toBe(60)
    expect(actual.byCategory['Other ministries and operations']).toBe(18)
    expect(actual.balance).toBe(0)
    expect(actual.spend).toBe(152)
  })

  it('combined proposed debt mode: P60 I60 water18 D7 U3.5 S3.5', () => {
    const { proposed } = aggregateReports(sundays, baseSettings)
    expect(proposed.pastor).toBe(60)
    expect(proposed.instrumentalists).toBe(60)
    expect(proposed.operatingExpenses).toBe(18)
    expect(proposed.debt).toBe(7)
    expect(proposed.ushering).toBe(3.5)
    expect(proposed.savings).toBe(3.5)
  })

  it('combined proposed no-debt: U7 S7 D0', () => {
    const { proposed } = aggregateReports(sundays, {
      ...baseSettings,
      noDebtMode: true,
    })
    expect(proposed.pastor).toBe(60)
    expect(proposed.instrumentalists).toBe(60)
    expect(proposed.operatingExpenses).toBe(18)
    expect(proposed.debt).toBe(0)
    expect(proposed.ushering).toBe(7)
    expect(proposed.savings).toBe(7)
  })

  it('named gifts never auto-apply to general model', () => {
    const withNamed: SundayReport = {
      ...sep6,
      incomes: [
        ...sep6.incomes,
        {
          id: 'n1',
          type: 'named_ministry_gift',
          label: 'Named gift',
          amount: 50,
          ministryName: 'Benevolence',
        },
      ],
    }
    const p = computeProposed(withNamed, baseSettings)
    expect(p.pastor).toBe(30)
    expect(p.instrumentalists).toBe(30)
    expect(p.debt).toBe(5)
    expect(p.namedGifts).toBe(50)
    // modeled amount still based on general 80 - 10
    expect(p.modeledAmount).toBe(70)
  })

  it('G >= 300 requires review unless override', () => {
    const high: SundayReport = {
      ...sep6,
      incomes: [
        {
          id: 'g',
          type: 'general_offertory',
          label: 'General',
          amount: 300,
        },
      ],
      expenses: [],
      overrideHighAmount: false,
    }
    const p = computeProposed(high, { ...baseSettings, deductOperatingExpenses: false })
    expect(p.requiresReview).toBe(true)
    expect(p.pastor).toBe(0)

    const overridden = { ...high, overrideHighAmount: true }
    // still requiresReview band but override allows... our engine returns early without override
    // With override, band still requiresReview flag on band - we skip the early return
    const p2 = computeProposed(overridden, {
      ...baseSettings,
      deductOperatingExpenses: false,
    })
    expect(p2.requiresReview).toBe(false)
  })

  it('actual balance warning numbers for sample', () => {
    expect(computeActual(sep6).balance).toBe(0)
    expect(computeActual(sep13).balance).toBe(0)
  })
})

describe('band labels are ASCII-safe for PDF', () => {
  it('13 Sep uses 70k to under 100k', () => {
    const sundays = createSampleSundays()
    const sep13 = sundays.find((s) => s.date === '2025-09-13')!
    const p = computeProposed(sep13, baseSettings)
    expect(p.bandLabel).toBe('70k to under 100k')
    expect(p.bandLabel).toMatch(/^[\x20-\x7E]+$/)
  })

  it('default band labels have no fancy dashes or inequalities', () => {
    for (const band of DEFAULT_SETTINGS.modelBands) {
      expect(band.label).toMatch(/^[\x20-\x7E]+$/)
      expect(band.label).not.toMatch(/[≤≥–—]/)
    }
  })
})
