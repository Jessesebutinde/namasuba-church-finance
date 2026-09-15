/** Amounts are stored in thousands of UGX (enter 20 for 20,000 UGX). */
export function fmtAmount(n: number, currencyLabel = 'UGX'): string {
  const v = Number.isFinite(n) ? n : 0
  const ugx = Math.round((v * 1000 + Number.EPSILON) * 100) / 100
  const whole =
    Number.isInteger(ugx) || Math.abs(ugx - Math.round(ugx)) < 1e-9
      ? Math.round(ugx)
      : ugx
  const str = Number(whole).toLocaleString('en-UG', {
    maximumFractionDigits: 0,
  })
  const label = (currencyLabel || 'UGX').trim() || 'UGX'
  // Avoid double-suffix if someone still typed "k"
  if (label.toLowerCase() === 'k') {
    return `${str} UGX`
  }
  return `${str} ${label}`
}

/** Short form for tight UI: 20k UGX */
export function fmtAmountShort(n: number, currencyLabel = 'UGX'): string {
  const v = Number.isFinite(n) ? n : 0
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100
  const str =
    Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9
      ? String(Math.round(rounded))
      : rounded.toFixed(1).replace(/\.0$/, '')
  const label = (currencyLabel || 'UGX').trim() || 'UGX'
  if (label.toLowerCase() === 'k') {
    return `${str}k UGX`
  }
  return `${str}k ${label}`
}

export function fmtDate(isoDate: string): string {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function todayISO(): string {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function balanceTone(balance: number): 'balanced' | 'review' | 'error' {
  if (Math.abs(balance) < 0.005) return 'balanced'
  if (Math.abs(balance) < 5) return 'review'
  return 'error'
}
