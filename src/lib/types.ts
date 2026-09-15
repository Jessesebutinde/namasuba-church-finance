export type IncomeType = 'general_offertory' | 'named_ministry_gift' | 'other'

export type MainCategory =
  | 'Pastor'
  | 'Instrumentalists'
  | 'Debt'
  | 'Ushering'
  | 'Savings'
  | 'Other ministries and operations'

export type ReportStatus = 'Draft' | 'Ready' | 'Approved' | 'Archived'
export type Role = 'Admin' | 'Viewer'

export interface IncomeLine {
  id: string
  type: IncomeType
  label: string
  amount: number
  ministryName?: string
}

export interface ExpenseLine {
  id: string
  category: MainCategory
  subcategory: string
  description: string
  amount: number
}

export interface SundayReport {
  id: string
  date: string // YYYY-MM-DD
  incomes: IncomeLine[]
  expenses: ExpenseLine[]
  notes: string
  enteredBy: string
  createdAt: string
  updatedAt: string
  status: ReportStatus
  overrideHighAmount?: boolean
}

export interface ModelBand {
  id: string
  label: string
  minG: number // inclusive
  maxG: number | null // exclusive, null = infinity
  pastorFixed: number | null // fixed k, or null if percent
  instFixed: number | null
  pastorPercent: number | null
  instPercent: number | null
  restDebt: number // fraction of remainder
  restUsher: number
  restSav: number
  noDebtMode: 'pastor_inst' | 'usher_sav' | 'none'
  noDebtPastorShare: number
  noDebtInstShare: number
  dormantPercent: number // of full week total
  requiresReview: boolean
}

export interface CategoryConfig {
  id: MainCategory
  label: string
  subcategories: string[]
  isOperatingExpense?: boolean
}

export interface AppSettings {
  churchName: string
  currencyLabel: string
  noDebtMode: boolean
  deductOperatingExpenses: boolean
  trialStart: string
  trialEnd: string
  trialReviewDate: string
  categories: CategoryConfig[]
  modelBands: ModelBand[]
  dormantMinistries: string[]
  operatingSubcategories: string[]
  adminPassword: string
  role: Role
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  detail: string
}

export interface AppState {
  settings: AppSettings
  sundays: SundayReport[]
  auditLog: AuditEntry[]
}

export interface ProposedAllocation {
  pastor: number
  instrumentalists: number
  debt: number
  ushering: number
  savings: number
  otherOps: number
  operatingExpenses: number
  dormant: Record<string, number>
  namedGifts: number
  requiresReview: boolean
  reviewMessage: string
  bandLabel: string
  modeledAmount: number
  generalOffertory: number
  totalProposed: number
}

export interface ActualTotals {
  income: number
  generalOffertory: number
  namedGifts: number
  otherIncome: number
  spend: number
  byCategory: Record<string, number>
  balance: number
  unexplained: number
}
