import type {
  AppSettings,
  SundayReport,
  ProposedAllocation,
  ActualTotals,
  ModelBand,
  MainCategory,
} from './types'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function selectBand(G: number, bands: ModelBand[]): ModelBand | null {
  const sorted = [...bands].sort((a, b) => a.minG - b.minG)
  for (const band of sorted) {
    const aboveMin = G >= band.minG
    const belowMax = band.maxG === null ? true : G < band.maxG
    if (aboveMin && belowMax) return band
  }
  return null
}

export function sumIncomes(report: SundayReport): {
  total: number
  general: number
  named: number
  other: number
} {
  let general = 0
  let named = 0
  let other = 0
  for (const line of report.incomes) {
    const a = Number(line.amount) || 0
    if (line.type === 'general_offertory') general += a
    else if (line.type === 'named_ministry_gift') named += a
    else other += a
  }
  return { total: general + named + other, general, named, other }
}

export function sumExpenses(report: SundayReport): {
  total: number
  byCategory: Record<string, number>
  bySubcategory: Record<string, number>
} {
  const byCategory: Record<string, number> = {}
  const bySubcategory: Record<string, number> = {}
  let total = 0
  for (const line of report.expenses) {
    const a = Number(line.amount) || 0
    total += a
    byCategory[line.category] = (byCategory[line.category] || 0) + a
    const key = `${line.category}::${line.subcategory}`
    bySubcategory[key] = (bySubcategory[key] || 0) + a
  }
  return { total, byCategory, bySubcategory }
}

export function operatingExpenseTotal(
  report: SundayReport,
  operatingSubcategories: string[],
): number {
  const ops = new Set(operatingSubcategories.map((s) => s.toLowerCase()))
  return report.expenses
    .filter((e) => ops.has(e.subcategory.toLowerCase()))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

/**
 * Proposed model for GENERAL OFFERTORY only.
 * Named ministry gifts never auto-apply.
 */
export function computeProposed(
  report: SundayReport,
  settings: Pick<
    AppSettings,
    | 'noDebtMode'
    | 'deductOperatingExpenses'
    | 'modelBands'
    | 'dormantMinistries'
    | 'operatingSubcategories'
  >,
): ProposedAllocation {
  const incomes = sumIncomes(report)
  const G = incomes.general
  const ops = settings.deductOperatingExpenses
    ? operatingExpenseTotal(report, settings.operatingSubcategories)
    : 0

  const empty: ProposedAllocation = {
    pastor: 0,
    instrumentalists: 0,
    debt: 0,
    ushering: 0,
    savings: 0,
    otherOps: 0,
    operatingExpenses: round2(ops),
    dormant: {},
    namedGifts: round2(incomes.named),
    requiresReview: false,
    reviewMessage: '',
    bandLabel: '',
    modeledAmount: 0,
    generalOffertory: round2(G),
    totalProposed: 0,
  }

  if (G <= 0) {
    empty.reviewMessage = 'No general offertory recorded for this Sunday.'
    empty.totalProposed = round2(ops + incomes.named)
    return empty
  }

  const band = selectBand(G, settings.modelBands)
  if (!band) {
    empty.requiresReview = true
    empty.reviewMessage = 'No matching model band. Please review jointly.'
    return empty
  }

  empty.bandLabel = band.label

  if (band.requiresReview && !report.overrideHighAmount) {
    empty.requiresReview = true
    empty.reviewMessage =
      'General offertory is at or above 300k. No automatic distribution — joint review by elders and admins is recommended unless an admin override is set.'
    empty.operatingExpenses = round2(ops)
    empty.totalProposed = round2(ops)
    return empty
  }

  // Band is selected on original G; allocation runs on amount after optional ops deduct.
  const modeled = Math.max(0, G - ops)
  empty.modeledAmount = round2(modeled)

  let pastor = 0
  let inst = 0

  if (band.pastorPercent != null && band.instPercent != null) {
    pastor = modeled * band.pastorPercent
    inst = modeled * band.instPercent
  } else {
    pastor = Math.min(band.pastorFixed ?? 0, modeled)
    const afterPastor = modeled - pastor
    inst = Math.min(band.instFixed ?? 0, afterPastor)
  }

  let remaining = modeled - pastor - inst

  const dormant: Record<string, number> = {}
  if (band.dormantPercent > 0 && settings.dormantMinistries.length > 0) {
    const dormantPool = round2(modeled * band.dormantPercent)
    const each = dormantPool / settings.dormantMinistries.length
    for (const name of settings.dormantMinistries) {
      dormant[name] = round2(each)
    }
    remaining = Math.max(0, remaining - dormantPool)
  }

  let debt = remaining * band.restDebt
  let usher = remaining * band.restUsher
  let sav = remaining * band.restSav

  if (settings.noDebtMode && debt > 0) {
    if (band.noDebtMode === 'pastor_inst') {
      pastor += debt * band.noDebtPastorShare
      inst += debt * band.noDebtInstShare
      debt = 0
    } else if (band.noDebtMode === 'usher_sav') {
      usher += debt * 0.5
      sav += debt * 0.5
      debt = 0
    }
  }

  const dormantTotal = Object.values(dormant).reduce((a, b) => a + b, 0)
  const totalProposed = round2(
    pastor + inst + debt + usher + sav + dormantTotal + ops,
  )

  return {
    pastor: round2(pastor),
    instrumentalists: round2(inst),
    debt: round2(debt),
    ushering: round2(usher),
    savings: round2(sav),
    otherOps: round2(dormantTotal),
    operatingExpenses: round2(ops),
    dormant,
    namedGifts: round2(incomes.named),
    requiresReview: false,
    reviewMessage: '',
    bandLabel: band.label,
    modeledAmount: round2(modeled),
    generalOffertory: round2(G),
    totalProposed,
  }
}

export function computeActual(report: SundayReport): ActualTotals {
  const incomes = sumIncomes(report)
  const expenses = sumExpenses(report)
  const balance = round2(incomes.total - expenses.total)
  return {
    income: round2(incomes.total),
    generalOffertory: round2(incomes.general),
    namedGifts: round2(incomes.named),
    otherIncome: round2(incomes.other),
    spend: round2(expenses.total),
    byCategory: Object.fromEntries(
      Object.entries(expenses.byCategory).map(([k, v]) => [k, round2(v)]),
    ),
    balance,
    unexplained: balance,
  }
}

export const BUCKET_KEYS = [
  'Pastor',
  'Instrumentalists',
  'Debt',
  'Ushering',
  'Savings',
  'Other ministries and operations',
] as const satisfies readonly MainCategory[]

export function proposedByCategory(p: ProposedAllocation): Record<string, number> {
  const otherTotal = round2(
    p.operatingExpenses + Object.values(p.dormant).reduce((a, b) => a + b, 0),
  )
  return {
    Pastor: p.pastor,
    Instrumentalists: p.instrumentalists,
    Debt: p.debt,
    Ushering: p.ushering,
    Savings: p.savings,
    'Other ministries and operations': otherTotal,
  }
}

export function categoryPercents(
  byCategory: Record<string, number>,
  total: number,
): Record<string, number> {
  if (total <= 0) return {}
  return Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, round2((v / total) * 100)]),
  )
}

export function aggregateReports(
  reports: SundayReport[],
  settings: Parameters<typeof computeProposed>[1],
): {
  actual: ActualTotals
  proposed: ProposedAllocation
  sundayCount: number
} {
  const actual: ActualTotals = {
    income: 0,
    generalOffertory: 0,
    namedGifts: 0,
    otherIncome: 0,
    spend: 0,
    byCategory: {},
    balance: 0,
    unexplained: 0,
  }

  const proposed: ProposedAllocation = {
    pastor: 0,
    instrumentalists: 0,
    debt: 0,
    ushering: 0,
    savings: 0,
    otherOps: 0,
    operatingExpenses: 0,
    dormant: {},
    namedGifts: 0,
    requiresReview: false,
    reviewMessage: '',
    bandLabel: 'Combined',
    modeledAmount: 0,
    generalOffertory: 0,
    totalProposed: 0,
  }

  for (const r of reports) {
    const a = computeActual(r)
    actual.income += a.income
    actual.generalOffertory += a.generalOffertory
    actual.namedGifts += a.namedGifts
    actual.otherIncome += a.otherIncome
    actual.spend += a.spend
    for (const [k, v] of Object.entries(a.byCategory)) {
      actual.byCategory[k] = (actual.byCategory[k] || 0) + v
    }

    const p = computeProposed(r, settings)
    proposed.pastor += p.pastor
    proposed.instrumentalists += p.instrumentalists
    proposed.debt += p.debt
    proposed.ushering += p.ushering
    proposed.savings += p.savings
    proposed.otherOps += p.otherOps
    proposed.operatingExpenses += p.operatingExpenses
    proposed.namedGifts += p.namedGifts
    proposed.modeledAmount += p.modeledAmount
    proposed.generalOffertory += p.generalOffertory
    proposed.totalProposed += p.totalProposed
    for (const [k, v] of Object.entries(p.dormant)) {
      proposed.dormant[k] = (proposed.dormant[k] || 0) + v
    }
    if (p.requiresReview) proposed.requiresReview = true
  }

  // Round aggregates
  actual.income = round2(actual.income)
  actual.generalOffertory = round2(actual.generalOffertory)
  actual.namedGifts = round2(actual.namedGifts)
  actual.otherIncome = round2(actual.otherIncome)
  actual.spend = round2(actual.spend)
  actual.balance = round2(actual.income - actual.spend)
  actual.unexplained = actual.balance
  for (const k of Object.keys(actual.byCategory)) {
    actual.byCategory[k] = round2(actual.byCategory[k])
  }

  proposed.pastor = round2(proposed.pastor)
  proposed.instrumentalists = round2(proposed.instrumentalists)
  proposed.debt = round2(proposed.debt)
  proposed.ushering = round2(proposed.ushering)
  proposed.savings = round2(proposed.savings)
  proposed.otherOps = round2(proposed.otherOps)
  proposed.operatingExpenses = round2(proposed.operatingExpenses)
  proposed.namedGifts = round2(proposed.namedGifts)
  proposed.modeledAmount = round2(proposed.modeledAmount)
  proposed.generalOffertory = round2(proposed.generalOffertory)
  proposed.totalProposed = round2(proposed.totalProposed)
  for (const k of Object.keys(proposed.dormant)) {
    proposed.dormant[k] = round2(proposed.dormant[k])
  }

  return { actual, proposed, sundayCount: reports.length }
}

export { round2 }
