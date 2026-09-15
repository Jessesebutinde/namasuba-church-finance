import type { AppState, AuditEntry } from './types'
import { DEFAULT_SETTINGS, STORAGE_KEY } from './defaults'
import { createSampleSundays } from './sampleData'
import { v4 as uuid } from 'uuid'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as AppState
    const settings = { ...DEFAULT_SETTINGS, ...parsed.settings }
    // Migrate legacy "k" unit label → UGX (values stay in thousands)
    if (!settings.currencyLabel || settings.currencyLabel.toLowerCase() === 'k') {
      settings.currencyLabel = 'UGX'
    }
    return {
      settings,
      sundays: Array.isArray(parsed.sundays) ? parsed.sundays : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    }
  } catch {
    return initialState()
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function initialState(): AppState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    sundays: createSampleSundays(),
    auditLog: [
      {
        id: uuid(),
        at: new Date().toISOString(),
        actor: 'System',
        action: 'preload',
        detail: 'Loaded sample Sundays (6 Sep & 13 Sep 2025) for discussion.',
      },
    ],
  }
}

export function makeAudit(
  actor: string,
  action: string,
  detail: string,
): AuditEntry {
  return {
    id: uuid(),
    at: new Date().toISOString(),
    actor,
    action,
    detail,
  }
}

export function exportJson(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function importJson(text: string): AppState {
  const parsed = JSON.parse(text) as AppState
  if (!parsed || !parsed.settings || !Array.isArray(parsed.sundays)) {
    throw new Error('Invalid backup file')
  }
  return {
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    sundays: parsed.sundays,
    auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
  }
}

export function sundaysToCsv(state: AppState): string {
  const rows: string[][] = [
    [
      'date',
      'status',
      'income_type',
      'income_label',
      'income_amount',
      'expense_category',
      'expense_subcategory',
      'expense_description',
      'expense_amount',
      'notes',
      'entered_by',
    ],
  ]
  for (const s of [...state.sundays].sort((a, b) => a.date.localeCompare(b.date))) {
    const max = Math.max(s.incomes.length, s.expenses.length, 1)
    for (let i = 0; i < max; i++) {
      const inc = s.incomes[i]
      const exp = s.expenses[i]
      rows.push([
        i === 0 ? s.date : '',
        i === 0 ? s.status : '',
        inc?.type ?? '',
        inc?.label ?? '',
        inc ? String(inc.amount) : '',
        exp?.category ?? '',
        exp?.subcategory ?? '',
        exp?.description ?? '',
        exp ? String(exp.amount) : '',
        i === 0 ? s.notes.replace(/\n/g, ' ') : '',
        i === 0 ? s.enteredBy : '',
      ])
    }
  }
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n')
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
