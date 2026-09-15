import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import type { AppSettings, SundayReport } from './types'
import {
  computeActual,
  computeProposed,
  proposedByCategory,
  aggregateReports,
} from './modelEngine'
import { DISCLAIMER } from './defaults'
import { fmtAmount, fmtDate } from './format'

export async function downloadElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  })
  const pageHeight = 1400
  const totalHeight = canvas.height
  const pages = Math.max(1, Math.ceil(totalHeight / pageHeight))

  if (pages === 1) {
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = filename
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
    a.download = filename.replace('.png', `-page${i + 1}.png`)
    a.click()
  }
}

export function buildPdfReport(
  reports: SundayReport[],
  settings: AppSettings,
  title = 'Sunday Finance Report — Draft for Discussion',
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 16

  const line = (txt: string, size = 10, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(txt, pageW - margin * 2)
    doc.text(lines, margin, y)
    y += lines.length * (size * 0.4 + 2)
    if (y > 280) {
      doc.addPage()
      y = 16
    }
  }

  doc.setTextColor(11, 31, 58)
  line(settings.churchName, 16, 'bold')
  line(title, 12, 'bold')
  doc.setTextColor(201, 162, 39)
  line('Proposed model · Actual distribution · For discussion', 9)
  doc.setTextColor(11, 31, 58)
  line(DISCLAIMER, 8)
  y += 2

  const { actual, proposed, sundayCount } = aggregateReports(reports, settings)
  line(`Period Sundays: ${sundayCount}`, 10, 'bold')
  line(
    `Income ${fmtAmount(actual.income, settings.currencyLabel)} · Actual spend ${fmtAmount(actual.spend, settings.currencyLabel)} · Balance ${fmtAmount(actual.balance, settings.currencyLabel)}`,
    10,
  )
  line(
    `Proposed (model): Pastor ${fmtAmount(proposed.pastor, settings.currencyLabel)}, Instrumentalists ${fmtAmount(proposed.instrumentalists, settings.currencyLabel)}, Debt ${fmtAmount(proposed.debt, settings.currencyLabel)}, Ushering ${fmtAmount(proposed.ushering, settings.currencyLabel)}, Savings ${fmtAmount(proposed.savings, settings.currencyLabel)}, Ops ${fmtAmount(proposed.operatingExpenses, settings.currencyLabel)}`,
    9,
  )
  y += 3

  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date))) {
    line(`Sunday ${fmtDate(r.date)} — ${r.status}`, 11, 'bold')
    const a = computeActual(r)
    const p = computeProposed(r, settings)
    const pc = proposedByCategory(p)
    line(
      `Income ${fmtAmount(a.income, settings.currencyLabel)} (general ${fmtAmount(a.generalOffertory, settings.currencyLabel)}, named gifts ${fmtAmount(a.namedGifts, settings.currencyLabel)})`,
      9,
    )
    line(
      `Actual spend ${fmtAmount(a.spend, settings.currencyLabel)} · Remaining ${fmtAmount(a.balance, settings.currencyLabel)}`,
      9,
    )
    line('Category | Actual | Proposed | Difference', 9, 'bold')
    const cats = [
      'Pastor',
      'Instrumentalists',
      'Debt',
      'Ushering',
      'Savings',
      'Other ministries and operations',
    ]
    for (const c of cats) {
      const act = a.byCategory[c] || 0
      const prop = pc[c] || 0
      const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
      line(
        `${c}: ${fmtAmount(act, settings.currencyLabel)} | ${fmtAmount(prop, settings.currencyLabel)} | ${fmtAmount(diff, settings.currencyLabel)}`,
        8,
      )
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

  doc.save(
    `${settings.churchName.replace(/\s+/g, '-')}-finance-draft.pdf`,
  )
}
