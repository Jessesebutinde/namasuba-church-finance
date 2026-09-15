import type { AppSettings, ModelBand, CategoryConfig } from './types'

export const DISCLAIMER =
  'This is a draft model for discussion and possible trial. Final approval and changes belong to the elders and admins collectively.'

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'Pastor', label: 'Pastor', subcategories: ['Weekly support'] },
  { id: 'Instrumentalists', label: 'Instrumentalists', subcategories: ['Music team'] },
  { id: 'Debt', label: 'Debt', subcategories: ['Loan repayment'] },
  { id: 'Ushering', label: 'Ushering', subcategories: ['Usher supplies'] },
  { id: 'Savings', label: 'Savings', subcategories: ['Reserve'] },
  {
    id: 'Other ministries and operations',
    label: 'Other ministries and operations',
    subcategories: [
      'Drinking water',
      'Media/WiFi',
      'Facilities',
      'Communication',
      'Benevolence',
      'Other church needs',
    ],
    isOperatingExpense: true,
  },
]

/** ASCII-only labels so Helvetica/jsPDF does not garble ≤ ≥ etc. */
export const DEFAULT_BANDS: ModelBand[] = [
  {
    id: 'le40',
    label: '40k or less',
    minG: 0,
    maxG: 40.0000001,
    pastorFixed: null,
    instFixed: null,
    pastorPercent: 0.5,
    instPercent: 0.5,
    restDebt: 0,
    restUsher: 0,
    restSav: 0,
    noDebtMode: 'none',
    noDebtPastorShare: 0,
    noDebtInstShare: 0,
    dormantPercent: 0,
    requiresReview: false,
  },
  {
    id: 'gt40_lt70',
    label: 'Above 40k under 70k',
    minG: 40.0000001,
    maxG: 70,
    pastorFixed: 20,
    instFixed: 20,
    pastorPercent: null,
    instPercent: null,
    restDebt: 0.5,
    restUsher: 0.25,
    restSav: 0.25,
    noDebtMode: 'pastor_inst',
    noDebtPastorShare: 0.75,
    noDebtInstShare: 0.25,
    dormantPercent: 0,
    requiresReview: false,
  },
  {
    id: 'ge70_lt100',
    label: '70k to under 100k',
    minG: 70,
    maxG: 100,
    pastorFixed: 30,
    instFixed: 30,
    pastorPercent: null,
    instPercent: null,
    restDebt: 0.5,
    restUsher: 0.25,
    restSav: 0.25,
    noDebtMode: 'usher_sav',
    noDebtPastorShare: 0,
    noDebtInstShare: 0,
    dormantPercent: 0,
    requiresReview: false,
  },
  {
    id: 'ge100_lt200',
    label: '100k to under 200k',
    minG: 100,
    maxG: 200,
    pastorFixed: 50,
    instFixed: 30,
    pastorPercent: null,
    instPercent: null,
    restDebt: 0.5,
    restUsher: 0.25,
    restSav: 0.25,
    noDebtMode: 'usher_sav',
    noDebtPastorShare: 0,
    noDebtInstShare: 0,
    dormantPercent: 0,
    requiresReview: false,
  },
  {
    id: 'ge200_lt300',
    label: '200k to under 300k',
    minG: 200,
    maxG: 300,
    pastorFixed: 70,
    instFixed: 30,
    pastorPercent: null,
    instPercent: null,
    restDebt: 0.5,
    restUsher: 0.25,
    restSav: 0.25,
    noDebtMode: 'usher_sav',
    noDebtPastorShare: 0,
    noDebtInstShare: 0,
    dormantPercent: 0.15,
    requiresReview: false,
  },
  {
    id: 'ge300',
    label: 'Above 300k',
    minG: 300,
    maxG: null,
    pastorFixed: null,
    instFixed: null,
    pastorPercent: null,
    instPercent: null,
    restDebt: 0,
    restUsher: 0,
    restSav: 0,
    noDebtMode: 'none',
    noDebtPastorShare: 0,
    noDebtInstShare: 0,
    dormantPercent: 0,
    requiresReview: true,
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  churchName: 'Namasuba Redeemed',
  currencyLabel: 'UGX',
  noDebtMode: true,
  deductOperatingExpenses: true,
  trialStart: '2025-09-01',
  trialEnd: '2025-12-31',
  trialReviewDate: '2025-12-15',
  categories: DEFAULT_CATEGORIES,
  modelBands: DEFAULT_BANDS,
  dormantMinistries: ['Media/WiFi', 'Facilities', 'Communication', 'Benevolence'],
  operatingSubcategories: ['Drinking water'],
  adminPassword: '',
  role: 'Admin',
}

export const STORAGE_KEY = 'namasuba-church-finance-v1'

/** Refresh known band labels to ASCII defaults (keeps custom mins/rules). */
export function migrateBandLabels(bands: ModelBand[] | undefined): ModelBand[] {
  const defaultsById = new Map(DEFAULT_BANDS.map((b) => [b.id, b]))
  if (!Array.isArray(bands) || bands.length === 0) {
    return DEFAULT_BANDS.map((b) => ({ ...b }))
  }
  return bands.map((b) => {
    const def = defaultsById.get(b.id)
    if (!def) {
      // Sanitize any fancy unicode in custom labels
      return {
        ...b,
        label: String(b.label ?? '')
          .replace(/≤/g, '<=')
          .replace(/≥/g, '>=')
          .replace(/–|—|−/g, '-')
          .replace(/[^\x20-\x7E]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || b.id,
      }
    }
    // Prefer ASCII default label for known band ids
    return { ...b, label: def.label }
  })
}
