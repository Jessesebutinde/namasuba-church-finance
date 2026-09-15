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

/** Reliable download for desktop + iOS Safari / GitHub Pages. */
export function triggerDownload(
  blobOrDataUrl: Blob | string,
  filename: string,
): void {
  let url: string
  let revoke = false
  if (typeof blobOrDataUrl === 'string') {
    url = blobOrDataUrl
  } else {
    url = URL.createObjectURL(blobOrDataUrl)
    revoke = true
  }
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) {
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }
}

function looksMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  // Coarse pointer + no hover ≈ phone/tablet
  try {
    return (
      window.matchMedia('(pointer: coarse)').matches &&
      !window.matchMedia('(hover: hover)').matches
    )
  } catch {
    return false
  }
}

async function tryShareFile(blob: Blob, filename: string): Promise<boolean> {
  if (!looksMobile()) return false
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false
  }
  try {
    const file = new File([blob], filename, {
      type: blob.type || 'application/octet-stream',
    })
    const data: ShareData = { files: [file], title: filename }
    if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
      return false
    }
    await navigator.share(data)
    return true
  } catch {
    // User cancel or unsupported — fall through to download
    return false
  }
}

function replaceChartsWithPlaceholders(clonedDoc: Document): void {
  const selectors = ['.recharts-wrapper', 'svg.recharts-surface', '.recharts-responsive-container']
  const seen = new Set<Element>()
  for (const sel of selectors) {
    clonedDoc.querySelectorAll(sel).forEach((node) => {
      const el = node as HTMLElement
      // Prefer replacing the outermost chart container once
      const wrapper =
        (el.closest('.recharts-wrapper') as HTMLElement | null) ||
        (el.closest('.recharts-responsive-container') as HTMLElement | null) ||
        el
      if (seen.has(wrapper)) return
      seen.add(wrapper)
      const placeholder = clonedDoc.createElement('div')
      placeholder.setAttribute(
        'style',
        [
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'min-height:120px',
          'width:100%',
          'padding:12px',
          'margin:8px 0',
          'border:1px dashed #c9a227',
          'background:#f7f1de',
          'color:#0b1f3a',
          'font-size:12px',
          'text-align:center',
          'box-sizing:border-box',
        ].join(';'),
      )
      placeholder.textContent = '[Chart — see PDF or on-screen preview for charts]'
      wrapper.replaceWith(placeholder)
    })
  }
}

async function waitForFontsAndImages(el: HTMLElement): Promise<void> {
  try {
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 800)),
      ])
    }
  } catch {
    /* ignore */
  }
  const images = Array.from(el.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 500)
        }),
    ),
  )
}

const H2C_BASE = {
  backgroundColor: '#ffffff' as string,
  scale: 2,
  useCORS: true,
  allowTaint: true,
  logging: false,
}

async function captureElement(
  el: HTMLElement,
  withChartFallback: boolean,
): Promise<HTMLCanvasElement> {
  const opts: Parameters<typeof html2canvas>[1] = {
    ...H2C_BASE,
    foreignObjectRendering: !withChartFallback,
  }
  if (withChartFallback) {
    opts.onclone = (clonedDoc: Document) => {
      replaceChartsWithPlaceholders(clonedDoc)
    }
  }
  try {
    return await html2canvas(el, opts)
  } catch (err) {
    if (!withChartFallback) throw err
    // Retry once more with foreignObjectRendering flipped the other way
    return await html2canvas(el, {
      ...H2C_BASE,
      foreignObjectRendering: true,
      onclone: (clonedDoc: Document) => {
        replaceChartsWithPlaceholders(clonedDoc)
      },
    })
  }
}

export async function downloadElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await waitForFontsAndImages(el)

  let canvas: HTMLCanvasElement
  try {
    canvas = await captureElement(el, false)
  } catch (firstErr) {
    // SVG/Recharts often break html2canvas — retry with chart placeholders
    try {
      canvas = await captureElement(el, true)
    } catch {
      throw firstErr instanceof Error
        ? firstErr
        : new Error('PNG capture failed (charts may not render in this browser)')
    }
  }

  // Phone-readable page slices (~iPhone-ish portrait at 2x)
  const pageHeight = 1400
  const totalHeight = canvas.height
  const pages = Math.max(1, Math.ceil(totalHeight / pageHeight))
  const base = filename.replace(/\.png$/i, '')

  const downloadCanvas = async (c: HTMLCanvasElement, name: string) => {
    const blob: Blob | null = await new Promise((resolve) =>
      c.toBlob((b) => resolve(b), 'image/png'),
    )
    if (blob) {
      const shared = await tryShareFile(blob, name)
      if (!shared) triggerDownload(blob, name)
      return
    }
    // Fallback if toBlob unsupported
    triggerDownload(c.toDataURL('image/png'), name)
  }

  if (pages === 1) {
    await downloadCanvas(canvas, `${base}.png`)
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
    await downloadCanvas(slice, `${base}-page${i + 1}.png`)
  }
}

function scopeLabel(reports: SundayReport[]): string {
  if (reports.length === 0) return 'No Sundays selected'
  if (reports.length === 1) return `Sunday ${fmtDate(reports[0].date)}`
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  return `${reports.length} Sundays · ${fmtDate(sorted[0].date)} – ${fmtDate(sorted[sorted.length - 1].date)}`
}

function pdfFilename(
  settings: AppSettings,
  contentMode: ReportContentMode,
): string {
  const modeTag = contentMode === 'actual' ? 'actual' : 'actual-proposed'
  return `${settings.churchName.replace(/\s+/g, '-')}-finance-${modeTag}.pdf`
}

/** Build the PDF document (does not download). */
export function createPdfReport(
  reports: SundayReport[],
  settings: AppSettings,
  options: ReportExportOptions | string = {},
): { doc: jsPDF; filename: string } {
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
    return { doc, filename: pdfFilename(settings, contentMode) }
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

  return { doc, filename: pdfFilename(settings, contentMode) }
}

/** Build PDF and trigger a download (blob + fallback to doc.save). */
export async function buildPdfReport(
  reports: SundayReport[],
  settings: AppSettings,
  options: ReportExportOptions | string = {},
): Promise<Blob> {
  const { doc, filename } = createPdfReport(reports, settings, options)
  const blob = doc.output('blob')
  const shared = await tryShareFile(blob, filename)
  if (!shared) {
    try {
      triggerDownload(blob, filename)
    } catch {
      // Last resort for older browsers
      doc.save(filename)
    }
  }
  return blob
}
