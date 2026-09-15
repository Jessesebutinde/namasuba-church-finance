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
import {
  asciiSafe,
  drawGroupedBars,
  drawGroupedBarsToDataUrl,
  drawGroupedBarsWithJsPdf,
  drawProgressionLines,
  drawProgressionToDataUrl,
  drawProgressionWithJsPdf,
  drawSimpleBars,
  drawSimpleBarsToDataUrl,
  drawSimpleBarsWithJsPdf,
  type GroupedBarItem,
  type ProgressionPoint,
  type SimpleBarItem,
  CHART_COLORS,
} from './drawCharts'

export type ReportContentMode = 'actual' | 'actual_proposed'

export interface ReportExportOptions {
  contentMode?: ReportContentMode
  includeProgression?: boolean
  includeCharts?: boolean
  title?: string
  /** Optional canvas factory for Node (node-canvas). */
  canvasFactory?: () => HTMLCanvasElement
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
    return false
  }
}

function scopeLabel(reports: SundayReport[]): string {
  if (reports.length === 0) return 'No Sundays selected'
  if (reports.length === 1) return `Sunday ${fmtDate(reports[0].date)}`
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  return `${reports.length} Sundays · ${fmtDate(sorted[0].date)} - ${fmtDate(sorted[sorted.length - 1].date)}`
}

/** Safe slug for filenames: church + period + report type. */
export function reportFilenameBase(
  settings: AppSettings,
  reports: SundayReport[],
  contentMode: ReportContentMode,
): string {
  const church = settings.churchName
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Church'
  const modeTag = contentMode === 'actual' ? 'actual' : 'actual-proposed'
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  let period = 'no-sundays'
  if (sorted.length === 1) {
    period = sorted[0].date // YYYY-MM-DD
  } else if (sorted.length > 1) {
    period = `${sorted[0].date}_to_${sorted[sorted.length - 1].date}`
  }
  return `${church}-finance-${modeTag}-${period}`
}

function pdfFilename(
  settings: AppSettings,
  reports: SundayReport[],
  contentMode: ReportContentMode,
): string {
  return `${reportFilenameBase(settings, reports, contentMode)}.pdf`
}

function buildGroupedSeries(
  actualByCat: Record<string, number>,
  propCats: Record<string, number> | null,
): GroupedBarItem[] {
  return CATS.map((name) => ({
    label: name.replace('Other ministries and operations', 'Other/ops'),
    actual: actualByCat[name] || 0,
    proposed: propCats ? propCats[name] || 0 : undefined,
  }))
}

function buildIncomeExpenseItems(report: SundayReport): SimpleBarItem[] {
  const a = computeActual(report)
  return [
    { label: 'Income', value: a.income, color: CHART_COLORS.navy },
    { label: 'Expenses', value: a.spend, color: CHART_COLORS.gold },
    { label: 'Balance', value: a.balance, color: CHART_COLORS.green },
  ]
}

function buildProgression(
  reports: SundayReport[],
): ProgressionPoint[] {
  return reports.map((s) => {
    const a = computeActual(s)
    return {
      label: fmtDate(s.date),
      income: a.income,
      spend: a.spend,
      pastor: a.byCategory['Pastor'] || 0,
      instrumentalists: a.byCategory['Instrumentalists'] || 0,
      savings: a.byCategory['Savings'] || 0,
      debt: a.byCategory['Debt'] || 0,
    }
  })
}

function tryCanvasFactory(
  opts?: ReportExportOptions,
): (() => HTMLCanvasElement) | undefined {
  if (opts?.canvasFactory) return opts.canvasFactory
  if (typeof document !== 'undefined') {
    return () => {
      const el = document.createElement('canvas')
      return el
    }
  }
  return undefined
}

function embedPng(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.addImage(dataUrl, 'PNG', x, y, w, h)
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
  const includeCharts = opts.includeCharts ?? true
  const title =
    opts.title ??
    (contentMode === 'actual'
      ? 'Sunday Finance Report - Actual (Draft)'
      : 'Sunday Finance Report - Draft for Discussion')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentW = pageW - margin * 2
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
    const safe = asciiSafe(txt)
    const lines = doc.splitTextToSize(safe, contentW)
    ensureSpace(lines.length * (size * 0.4 + 2) + 2)
    doc.text(lines, margin, y)
    y += lines.length * (size * 0.4 + 2)
  }

  const tableRow = (
    cols: string[],
    widths: number[],
    size = 8,
    bold = false,
  ) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    ensureSpace(6)
    let x = margin
    cols.forEach((c, i) => {
      const align = i === 0 ? 'left' : 'right'
      const cell = asciiSafe(c)
      if (align === 'right') {
        doc.text(cell, x + widths[i], y, { align: 'right' })
      } else {
        doc.text(cell, x, y)
      }
      x += widths[i]
    })
    y += 5
  }

  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const canvasFactory = tryCanvasFactory(opts)

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
    return { doc, filename: pdfFilename(settings, sorted, contentMode) }
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

  // ── Charts ──────────────────────────────────────────────────────
  if (includeCharts) {
    const chartW = contentW
    const chartHmm = 52
    const imgW = 700
    const imgH = 280

    const addChartBlock = (
      sectionTitle: string,
      drawJsPdf: () => void,
      makeDataUrl: (() => string) | null,
      blockH = chartHmm,
    ) => {
      y += 3
      line(sectionTitle, 11, 'bold')
      ensureSpace(blockH + 4)
      let embedded = false
      if (makeDataUrl && canvasFactory) {
        try {
          const dataUrl = makeDataUrl()
          if (dataUrl && dataUrl.startsWith('data:image')) {
            embedPng(doc, dataUrl, margin, y, chartW, blockH)
            embedded = true
          }
        } catch {
          embedded = false
        }
      }
      if (!embedded) {
        drawJsPdf()
      }
      y += blockH + 2
    }

    // Income & expenses (single Sunday)
    if (sorted.length === 1) {
      const items = buildIncomeExpenseItems(sorted[0])
      addChartBlock(
        'Income & expenses',
        () =>
          drawSimpleBarsWithJsPdf(doc, margin, y, chartW, chartHmm - 4, items),
        canvasFactory
          ? () =>
              drawSimpleBarsToDataUrl(items, imgW, 220, () => {
                const c = canvasFactory()
                c.width = imgW
                c.height = 220
                return c
              })
          : null,
        44,
      )
    }

    // Actual vs proposed / by category
    const grouped = buildGroupedSeries(
      actual.byCategory,
      contentMode === 'actual_proposed' ? propCats : null,
    )
    addChartBlock(
      contentMode === 'actual_proposed'
        ? 'Actual vs proposed (chart)'
        : 'Actual by category (chart)',
      () =>
        drawGroupedBarsWithJsPdf(doc, margin, y, chartW, chartHmm, grouped),
      canvasFactory
        ? () =>
            drawGroupedBarsToDataUrl(grouped, imgW, imgH, () => {
              const c = canvasFactory()
              c.width = imgW
              c.height = imgH
              return c
            })
        : null,
    )

    if (includeProgression && sorted.length > 1) {
      const prog = buildProgression(sorted)
      addChartBlock(
        'Progression across Sundays',
        () =>
          drawProgressionWithJsPdf(doc, margin, y, chartW, chartHmm, prog),
        canvasFactory
          ? () =>
              drawProgressionToDataUrl(prog, imgW, imgH, () => {
                const c = canvasFactory()
                c.width = imgW
                c.height = imgH
                return c
              })
          : null,
      )
    }
  }

  const colW =
    contentMode === 'actual_proposed'
      ? [70, 40, 40, 32]
      : [90, 50]

  if (contentMode === 'actual_proposed') {
    y += 2
    line('Combined comparison (for discussion)', 11, 'bold')
    tableRow(['Category', 'Actual', 'Proposed', 'Difference'], colW, 8, true)
    for (const c of CATS) {
      const act = actual.byCategory[c] || 0
      const prop = propCats[c] || 0
      const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
      tableRow(
        [
          c.replace('Other ministries and operations', 'Other / ops'),
          fmtAmount(act, settings.currencyLabel),
          fmtAmount(prop, settings.currencyLabel),
          fmtAmount(diff, settings.currencyLabel),
        ],
        colW,
        8,
      )
    }
  } else {
    y += 2
    line('Combined actual by category', 11, 'bold')
    tableRow(['Category', 'Actual'], colW, 8, true)
    for (const c of CATS) {
      const act = actual.byCategory[c] || 0
      tableRow(
        [
          c.replace('Other ministries and operations', 'Other / ops'),
          fmtAmount(act, settings.currencyLabel),
        ],
        colW,
        8,
      )
    }
  }

  if (includeProgression && sorted.length > 1) {
    y += 3
    line('Progression across selected Sundays', 11, 'bold')
    const pw = [28, 28, 28, 26, 26, 26, 26]
    tableRow(
      ['Date', 'Income', 'Spend', 'Pastor', 'Inst', 'Savings', 'Debt'],
      pw,
      7,
      true,
    )
    for (const r of sorted) {
      const a = computeActual(r)
      tableRow(
        [
          fmtDate(r.date),
          fmtAmount(a.income, settings.currencyLabel),
          fmtAmount(a.spend, settings.currencyLabel),
          fmtAmount(a.byCategory['Pastor'] || 0, settings.currencyLabel),
          fmtAmount(
            a.byCategory['Instrumentalists'] || 0,
            settings.currencyLabel,
          ),
          fmtAmount(a.byCategory['Savings'] || 0, settings.currencyLabel),
          fmtAmount(a.byCategory['Debt'] || 0, settings.currencyLabel),
        ],
        pw,
        7,
      )
    }
  }

  y += 3
  for (const r of sorted) {
    line(`Sunday ${fmtDate(r.date)} - ${r.status}`, 11, 'bold')
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
      tableRow(['Category', 'Actual', 'Proposed', 'Difference'], colW, 8, true)
      for (const c of CATS) {
        const act = a.byCategory[c] || 0
        const prop = pc[c] || 0
        const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
        tableRow(
          [
            c.replace('Other ministries and operations', 'Other / ops'),
            fmtAmount(act, settings.currencyLabel),
            fmtAmount(prop, settings.currencyLabel),
            fmtAmount(diff, settings.currencyLabel),
          ],
          colW,
          8,
        )
      }
      if (p.bandLabel) line(`Model band: ${asciiSafe(p.bandLabel)}`, 8)
    } else {
      tableRow(['Category', 'Actual'], [90, 50], 8, true)
      for (const c of CATS) {
        const act = a.byCategory[c] || 0
        tableRow(
          [
            c.replace('Other ministries and operations', 'Other / ops'),
            fmtAmount(act, settings.currencyLabel),
          ],
          [90, 50],
          8,
        )
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
            `  ${exp.category} / ${exp.subcategory}: ${fmtAmount(exp.amount, settings.currencyLabel)}${exp.description ? ` - ${exp.description}` : ''}`,
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

  return { doc, filename: pdfFilename(settings, sorted, contentMode) }
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
      doc.save(filename)
    }
  }
  return blob
}

/* ─── PNG export with real chart canvases ────────────────────────── */

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

/**
 * Compose a phone-readable PNG: title + drawn charts + key tables.
 * Does NOT rely on html2canvas of Recharts SVGs.
 */
export async function downloadReportPng(
  reports: SundayReport[],
  settings: AppSettings,
  options: ReportExportOptions = {},
): Promise<void> {
  const contentMode = options.contentMode ?? 'actual_proposed'
  const includeProgression =
    options.includeProgression ?? reports.length > 1
  const includeCharts = options.includeCharts ?? true
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const filename = `${reportFilenameBase(settings, sorted, contentMode)}.png`

  const width = 720
  const chartH = 260
  const simpleH = 200
  const sections: HTMLCanvasElement[] = []

  const makeCanvas = (h: number) => {
    const c = document.createElement('canvas')
    c.width = width
    c.height = h
    return c
  }

  // Title block
  {
    const c = makeCanvas(140)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, 140)
    ctx.fillStyle = CHART_COLORS.navy
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif'
    ctx.fillText(settings.churchName, 24, 36)
    ctx.font = '16px Helvetica, Arial, sans-serif'
    ctx.fillText(
      contentMode === 'actual'
        ? 'Sunday Finance Report - Actual (Draft)'
        : 'Sunday Finance Report - Draft for Discussion',
      24,
      62,
    )
    ctx.fillStyle = CHART_COLORS.gold
    ctx.font = '12px Helvetica, Arial, sans-serif'
    ctx.fillText(asciiSafe(scopeLabel(sorted)), 24, 86)
    ctx.fillStyle = CHART_COLORS.muted
    ctx.font = '11px Helvetica, Arial, sans-serif'
    const disc = asciiSafe(DISCLAIMER)
    const words = disc.split(' ')
    let line = ''
    let ty = 108
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > width - 48) {
        ctx.fillText(line, 24, ty)
        line = w
        ty += 14
      } else {
        line = test
      }
    }
    if (line) ctx.fillText(line, 24, ty)
    sections.push(c)
  }

  if (!sorted.length) {
    const c = makeCanvas(60)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, 60)
    ctx.fillStyle = CHART_COLORS.muted
    ctx.font = '14px Helvetica, Arial, sans-serif'
    ctx.fillText('No Sundays in this report scope.', 24, 30)
    sections.push(c)
  } else {
    const { actual, proposed } = aggregateReports(sorted, settings)
    const propCats = proposedByCategory(proposed)

    // Summary numbers
    {
      const c = makeCanvas(80)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, 80)
      ctx.fillStyle = CHART_COLORS.navy
      ctx.font = '13px Helvetica, Arial, sans-serif'
      ctx.fillText(
        `Income ${fmtAmount(actual.income, settings.currencyLabel)}  |  Spend ${fmtAmount(actual.spend, settings.currencyLabel)}  |  Balance ${fmtAmount(actual.balance, settings.currencyLabel)}`,
        24,
        28,
      )
      if (contentMode === 'actual_proposed') {
        ctx.fillText(
          `Proposed total ${fmtAmount(proposed.totalProposed, settings.currencyLabel)}`,
          24,
          52,
        )
      }
      sections.push(c)
    }

    if (includeCharts) {
      if (sorted.length === 1) {
        const c = makeCanvas(simpleH)
        const ctx = c.getContext('2d')!
        drawSimpleBars(ctx, width, simpleH, buildIncomeExpenseItems(sorted[0]))
        sections.push(c)
      }

      {
        const c = makeCanvas(chartH)
        const ctx = c.getContext('2d')!
        drawGroupedBars(
          ctx,
          width,
          chartH,
          buildGroupedSeries(
            actual.byCategory,
            contentMode === 'actual_proposed' ? propCats : null,
          ),
        )
        sections.push(c)
      }

      if (includeProgression && sorted.length > 1) {
        const c = makeCanvas(chartH)
        const ctx = c.getContext('2d')!
        drawProgressionLines(ctx, width, chartH, buildProgression(sorted))
        sections.push(c)
      }
    }

    // Key comparison table as canvas text
    {
      const rows = CATS.length + 2
      const c = makeCanvas(28 + rows * 22)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, c.height)
      ctx.fillStyle = CHART_COLORS.navy
      ctx.font = 'bold 14px Helvetica, Arial, sans-serif'
      ctx.fillText(
        contentMode === 'actual_proposed'
          ? 'Combined comparison'
          : 'Combined actual by category',
        24,
        22,
      )
      ctx.font = '12px Helvetica, Arial, sans-serif'
      let ty = 48
      for (const cat of CATS) {
        const act = actual.byCategory[cat] || 0
        const label = cat.replace('Other ministries and operations', 'Other/ops')
        if (contentMode === 'actual_proposed') {
          const prop = propCats[cat] || 0
          const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
          ctx.fillText(
            `${label}:  Act ${fmtAmount(act, settings.currencyLabel)}  Prop ${fmtAmount(prop, settings.currencyLabel)}  Diff ${fmtAmount(diff, settings.currencyLabel)}`,
            24,
            ty,
          )
        } else {
          ctx.fillText(
            `${label}:  ${fmtAmount(act, settings.currencyLabel)}`,
            24,
            ty,
          )
        }
        ty += 22
      }
      sections.push(c)
    }
  }

  const totalH = sections.reduce((s, c) => s + c.height, 0)
  const out = document.createElement('canvas')
  out.width = width
  out.height = totalH
  const octx = out.getContext('2d')!
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, width, totalH)
  let oy = 0
  for (const s of sections) {
    octx.drawImage(s, 0, oy)
    oy += s.height
  }

  // Slice for phone readability
  const pageHeight = 1400
  const pages = Math.max(1, Math.ceil(totalH / pageHeight))
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
    triggerDownload(c.toDataURL('image/png'), name)
  }

  if (pages === 1) {
    await downloadCanvas(out, `${base}.png`)
    return
  }
  for (let i = 0; i < pages; i++) {
    const slice = document.createElement('canvas')
    const h = Math.min(pageHeight, totalH - i * pageHeight)
    slice.width = width
    slice.height = h
    const ctx = slice.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(out, 0, i * pageHeight, width, h, 0, 0, width, h)
    await downloadCanvas(slice, `${base}-page${i + 1}.png`)
  }
}

/** Legacy: capture a DOM element (used for print preview fallback). */
export async function downloadElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await waitForFontsAndImages(el)

  // Replace Recharts with drawn chart images when present
  const chartImgs = el.querySelectorAll('img[data-export-chart]')
  if (chartImgs.length === 0) {
    // Prefer composing from data if caller didn't prepare imgs —
    // still try html2canvas but strip broken SVGs
  }

  const opts: Parameters<typeof html2canvas>[1] = {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    onclone: (clonedDoc: Document) => {
      const selectors = [
        '.recharts-wrapper',
        'svg.recharts-surface',
        '.recharts-responsive-container',
      ]
      const seen = new Set<Element>()
      for (const sel of selectors) {
        clonedDoc.querySelectorAll(sel).forEach((node) => {
          const eln = node as HTMLElement
          const wrapper =
            (eln.closest('.recharts-wrapper') as HTMLElement | null) ||
            (eln.closest('.recharts-responsive-container') as HTMLElement | null) ||
            eln
          if (seen.has(wrapper)) return
          seen.add(wrapper)
          // If a sibling export img exists, hide the SVG wrapper
          const parent = wrapper.parentElement
          const exportImg = parent?.querySelector(
            'img[data-export-chart]',
          ) as HTMLImageElement | null
          if (exportImg) {
            wrapper.style.display = 'none'
            exportImg.style.display = 'block'
            exportImg.style.width = '100%'
            exportImg.style.height = 'auto'
          } else {
            const placeholder = clonedDoc.createElement('div')
            placeholder.setAttribute(
              'style',
              'display:flex;align-items:center;justify-content:center;min-height:120px;width:100%;padding:12px;margin:8px 0;border:1px dashed #c9a227;background:#f7f1de;color:#0b1f3a;font-size:12px;text-align:center;box-sizing:border-box;',
            )
            placeholder.textContent =
              '[Chart rendered in PDF / composed PNG export]'
            wrapper.replaceWith(placeholder)
          }
        })
      }
    },
  }

  const canvas = await html2canvas(el, opts)
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  )
  const name = filename.endsWith('.png') ? filename : `${filename}.png`
  if (blob) {
    const shared = await tryShareFile(blob, name)
    if (!shared) triggerDownload(blob, name)
  } else {
    triggerDownload(canvas.toDataURL('image/png'), name)
  }
}
