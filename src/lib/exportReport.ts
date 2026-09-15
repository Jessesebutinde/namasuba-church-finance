import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import type { AppSettings, SundayReport } from './types'
import {
  computeActual,
  computeProposed,
  proposedByCategory,
  aggregateReports,
  BUCKET_KEYS,
} from './modelEngine'
import { DISCLAIMER } from './defaults'
import { fmtAmount, fmtDate } from './format'

export type ReportContentMode = 'actual' | 'actual_proposed'

export interface ReportExportOptions {
  contentMode?: ReportContentMode
  includeProgression?: boolean
  title?: string
}

const CATS = [...BUCKET_KEYS]

export async function downloadElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
  })
  // Phone-readable page slices (~iPhone-ish portrait at 2x)
  const pageHeight = 1400
  const totalHeight = canvas.height
  const pages = Math.max(1, Math.ceil(totalHeight / pageHeight))

  if (pages === 1) {
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`
    a.click()
    return
  }

  for (let i = 0; i < pages; i++) {
    const slice = document.createElement('canvas')
    const h = Math.min(pageHeight, totalHeight - i * pageHeight)
    slice.width = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(
      canvas,
      0,
      i * pageHeight,
      canvas.width,
      h,
      0,
      0,
      canvas.width,
      h,
    )
    const a = document.createElement('a')
    a.href = slice.toDataURL('image/png')
    const base = filename.replace(/\.png$/i, '')
    a.download = `${base}-page${i + 1}.png`
    a.click()
  }
}

function scopeLabel(reports: SundayReport[]): string {
  if (reports.length === 0) return 'No Sundays selected'
  if (reports.length === 1) return `Sunday ${fmtDate(reports[0].date)}`
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  return `${reports.length} Sundays · ${fmtDate(sorted[0].date)} – ${fmtDate(sorted[sorted.length - 1].date)}`
}

export function buildPdfReport(
  reports: SundayReport[],
  settings: AppSettings,
  options: ReportExportOptions | string = {},
): void {
  const opts: ReportExportOptions =
    typeof options === 'string' ? { title: options } : options
  const contentMode: ReportContentMode = opts.contentMode ?? 'actual_proposed'
  const includeProgression =
    opts.includeProgression ?? reports.length > 1
  const title =
    opts.title ??
    (contentMode === 'actual'
      ? 'Sunday Finance Report — Actual (Draft)'
      : 'Sunday Finance Report — Draft for Discussion')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 16

  const ensureSpace = (need = 12) => {
    if (y + need > 280) {
      doc.addPage()
      y = 16
    }
  }

  const line = (txt: string, size = 10, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(txt, pageW - margin * 2)
    ensureSpace(lines.length * (size * 0.4 + 2) + 2)
    doc.text(lines, margin, y)
    y += lines.length * (size * 0.4 + 2)
  }

  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))

  doc.setTextColor(11, 31, 58)
  line(settings.churchName, 16, 'bold')
  line(title, 12, 'bold')
  doc.setTextColor(201, 162, 39)
  line(
    contentMode === 'actual'
      ? 'Actual incomes & expenses · For discussion'
      : 'Proposed model · Actual distribution · For discussion',
    9,
  )
  doc.setTextColor(11, 31, 58)
  line(DISCLAIMER, 8)
  y += 2

  line(`Scope: ${scopeLabel(sorted)}`, 10, 'bold')
  line(
    `Content: ${contentMode === 'actual' ? 'Actual only' : 'Actual + proposed comparison'}`,
    9,
  )

  if (sorted.length === 0) {
    line('No Sundays in this report scope.', 10)
    doc.save(
      `${settings.churchName.replace(/\s+/g, '-')}-finance-draft.pdf`,
    )
    return
  }

  const { actual, proposed, sundayCount } = aggregateReports(sorted, settings)
  const propCats = proposedByCategory(proposed)

  line(`Period Sundays: ${sundayCount}`, 10, 'bold')
  line(
    `Income ${fmtAmount(actual.income, settings.currencyLabel)} · Actual spend ${fmtAmount(actual.spend, settings.currencyLabel)} · Balance ${fmtAmount(actual.balance, settings.currencyLabel)}`,
    10,
  )
  line(
    `Named gifts (excluded from model): ${fmtAmount(actual.namedGifts, settings.currencyLabel)}`,
    9,
  )

  if (contentMode === 'actual_proposed') {
    line(
      `Proposed (model): Pastor ${fmtAmount(proposed.pastor, settings.currencyLabel)}, Instrumentalists ${fmtAmount(proposed.instrumentalists, settings.currencyLabel)}, Debt ${fmtAmount(proposed.debt, settings.currencyLabel)}, Ushering ${fmtAmount(proposed.ushering, settings.currencyLabel)}, Savings ${fmtAmount(proposed.savings, settings.currencyLabel)}, Ops ${fmtAmount(proposed.operatingExpenses, settings.currencyLabel)}`,
      9,
    )
    y += 2
    line('Combined comparison (for discussion)', 11, 'bold')
    line('Category | Actual | Proposed | Difference', 9, 'bold')
    for (const c of CATS) {
      const act = actual.byCategory[c] || 0
      const prop = propCats[c] || 0
      const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
      line(
        `${c}: ${fmtAmount(act, settings.currencyLabel)} | ${fmtAmount(prop, settings.currencyLabel)} | ${fmtAmount(diff, settings.currencyLabel)}`,
        8,
      )
    }
  } else {
    y += 2
    line('Combined actual by category', 11, 'bold')
    for (const c of CATS) {
      const act = actual.byCategory[c] || 0
      line(`${c}: ${fmtAmount(act, settings.currencyLabel)}`, 9)
    }
  }

  if (includeProgression && sorted.length > 1) {
    y += 3
    line('Progression across selected Sundays', 11, 'bold')
    line(
      'Date | Income | Spend | Pastor | Inst | Savings | Debt',
      8,
      'bold',
    )
    for (const r of sorted) {
      const a = computeActual(r)
      line(
        `${fmtDate(r.date)} | ${fmtAmount(a.income, settings.currencyLabel)} | ${fmtAmount(a.spend, settings.currencyLabel)} | ${fmtAmount(a.byCategory['Pastor'] || 0, settings.currencyLabel)} | ${fmtAmount(a.byCategory['Instrumentalists'] || 0, settings.currencyLabel)} | ${fmtAmount(a.byCategory['Savings'] || 0, settings.currencyLabel)} | ${fmtAmount(a.byCategory['Debt'] || 0, settings.currencyLabel)}`,
        8,
      )
    }
  }

  y += 3
  for (const r of sorted) {
    line(`Sunday ${fmtDate(r.date)} — ${r.status}`, 11, 'bold')
    const a = computeActual(r)
    line(
      `Income ${fmtAmount(a.income, settings.currencyLabel)} (general ${fmtAmount(a.generalOffertory, settings.currencyLabel)}, named gifts ${fmtAmount(a.namedGifts, settings.currencyLabel)})`,
      9,
    )
    line(
      `Actual spend ${fmtAmount(a.spend, settings.currencyLabel)} · Remaining ${fmtAmount(a.balance, settings.currencyLabel)}`,
      9,
    )

    if (contentMode === 'actual_proposed') {
      const p = computeProposed(r, settings)
      const pc = proposedByCategory(p)
      line('Category | Actual | Proposed | Difference', 9, 'bold')
      for (const c of CATS) {
        const act = a.byCategory[c] || 0
        const prop = pc[c] || 0
        const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
        line(
          `${c}: ${fmtAmount(act, settings.currencyLabel)} | ${fmtAmount(prop, settings.currencyLabel)} | ${fmtAmount(diff, settings.currencyLabel)}`,
          8,
        )
      }
      if (p.bandLabel) line(`Model band: ${p.bandLabel}`, 8)
    } else {
      line('Category | Actual', 9, 'bold')
      for (const c of CATS) {
        const act = a.byCategory[c] || 0
        line(`${c}: ${fmtAmount(act, settings.currencyLabel)}`, 8)
      }
      // Income lines for clarity
      if (r.incomes.length) {
        line('Income lines:', 8, 'bold')
        for (const inc of r.incomes) {
          line(
            `  ${inc.label || inc.type}: ${fmtAmount(inc.amount, settings.currencyLabel)}`,
            8,
          )
        }
      }
      if (r.expenses.length) {
        line('Expense lines:', 8, 'bold')
        for (const exp of r.expenses) {
          line(
            `  ${exp.category} / ${exp.subcategory}: ${fmtAmount(exp.amount, settings.currencyLabel)}${exp.description ? ` — ${exp.description}` : ''}`,
            8,
          )
        }
      }
    }
    if (r.notes) line(`Notes: ${r.notes}`, 8)
    y += 2
  }

  y += 6
  line('Signatures (for discussion / trial)', 11, 'bold')
  y += 4
  line('Elder / Admin: ________________________    Date: __________', 9)
  y += 6
  line('Elder / Admin: ________________________    Date: __________', 9)
  y += 6
  line('Prepared by: __________________________    Date: __________', 9)
  y += 8
  line(DISCLAIMER, 7)

  const modeTag = contentMode === 'actual' ? 'actual' : 'actual-proposed'
  doc.save(
    `${settings.churchName.replace(/\s+/g, '-')}-finance-${modeTag}.pdf`,
  )
}
