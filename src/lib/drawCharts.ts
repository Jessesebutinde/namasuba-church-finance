/**
 * Pure chart drawing for PDF/PNG export.
 * Canvas path (browser / node-canvas) + jsPDF primitives (works everywhere).
 */

import type { jsPDF } from 'jspdf'

export const CHART_COLORS = {
  navy: '#0B1F3A',
  gold: '#C9A227',
  mutedBlue: '#3A5A7A',
  green: '#1F7A4D',
  red: '#B42318',
  grid: '#E5E7EB',
  text: '#0B1F3A',
  muted: '#5A6A7A',
  white: '#FFFFFF',
  lightGold: '#F7F1DE',
} as const

export interface GroupedBarItem {
  label: string
  actual: number
  proposed?: number
}

export interface SimpleBarItem {
  label: string
  value: number
  color?: string
}

export interface ProgressionPoint {
  label: string
  income: number
  spend: number
  pastor?: number
  instrumentalists?: number
  savings?: number
  debt?: number
}

/** Strip non-ASCII that corrupts Helvetica in jsPDF (e.g. ≤ → garbled). */
export function asciiSafe(text: string): string {
  return String(text ?? '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/–|—|−/g, '-')
    .replace(/·/g, ' | ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortLabel(name: string, max = 10): string {
  const s = asciiSafe(
    name.replace('Other ministries and operations', 'Other/ops'),
  )
  return s.length > max ? `${s.slice(0, max - 1)}...` : s
}

function maxOf(nums: number[]): number {
  let m = 0
  for (const n of nums) if (Number.isFinite(n) && n > m) m = n
  return m || 1
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * exp
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* ─── Canvas drawing ─────────────────────────────────────────────── */

type Ctx = CanvasRenderingContext2D

function clearBg(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = CHART_COLORS.white
  ctx.fillRect(0, 0, w, h)
}

function drawAxisFrame(
  ctx: Ctx,
  left: number,
  top: number,
  plotW: number,
  plotH: number,
  yMax: number,
) {
  ctx.strokeStyle = CHART_COLORS.grid
  ctx.lineWidth = 1
  ctx.fillStyle = CHART_COLORS.muted
  ctx.font = '10px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const y = top + plotH - t * plotH
    const val = yMax * t
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(left + plotW, y)
    ctx.stroke()
    const label =
      val >= 1000 ? `${Math.round(val)}` : val % 1 === 0 ? String(val) : val.toFixed(1)
    // UGX = value * 1000 for axis hint when values look like "k" units
    ctx.fillText(label, left - 4, y)
  }
  ctx.strokeStyle = CHART_COLORS.navy
  ctx.beginPath()
  ctx.moveTo(left, top)
  ctx.lineTo(left, top + plotH)
  ctx.lineTo(left + plotW, top + plotH)
  ctx.stroke()
}

/** Actual vs Proposed grouped bars by category (values in thousands). */
export function drawGroupedBars(
  ctx: Ctx,
  width: number,
  height: number,
  series: GroupedBarItem[],
): void {
  clearBg(ctx, width, height)
  const padL = 44
  const padR = 12
  const padT = 28
  const padB = 48
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const hasProposed = series.some((s) => s.proposed != null)
  const yMax = niceMax(
    maxOf(series.flatMap((s) => [s.actual, s.proposed ?? 0])),
  )

  ctx.fillStyle = CHART_COLORS.navy
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(hasProposed ? 'Actual vs proposed' : 'Actual by category', 8, 6)

  drawAxisFrame(ctx, padL, padT, plotW, plotH, yMax)

  const n = Math.max(series.length, 1)
  const groupW = plotW / n
  const barW = hasProposed ? groupW * 0.32 : groupW * 0.5
  const gap = hasProposed ? groupW * 0.06 : 0

  series.forEach((item, i) => {
    const cx = padL + i * groupW + groupW / 2
    const aH = (item.actual / yMax) * plotH
    const ax = hasProposed ? cx - barW - gap / 2 : cx - barW / 2
    ctx.fillStyle = CHART_COLORS.navy
    ctx.fillRect(ax, padT + plotH - aH, barW, aH)

    if (hasProposed && item.proposed != null) {
      const pH = (item.proposed / yMax) * plotH
      const px = cx + gap / 2
      ctx.fillStyle = CHART_COLORS.gold
      ctx.fillRect(px, padT + plotH - pH, barW, pH)
    }

    ctx.fillStyle = CHART_COLORS.text
    ctx.font = '9px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(shortLabel(item.label, 11), cx, padT + plotH + 6)
  })

  // Legend
  if (hasProposed) {
    const lx = width - 150
    ctx.fillStyle = CHART_COLORS.navy
    ctx.fillRect(lx, 8, 10, 10)
    ctx.fillStyle = CHART_COLORS.text
    ctx.font = '10px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Actual', lx + 14, 13)
    ctx.fillStyle = CHART_COLORS.gold
    ctx.fillRect(lx + 60, 8, 10, 10)
    ctx.fillStyle = CHART_COLORS.text
    ctx.fillText('Proposed', lx + 74, 13)
  }
}

/** Income / Expenses / Balance simple bars. */
export function drawSimpleBars(
  ctx: Ctx,
  width: number,
  height: number,
  items: SimpleBarItem[],
): void {
  clearBg(ctx, width, height)
  const padL = 44
  const padR = 12
  const padT = 28
  const padB = 40
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const yMax = niceMax(maxOf(items.map((i) => Math.abs(i.value))))

  ctx.fillStyle = CHART_COLORS.navy
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Income & expenses', 8, 6)

  drawAxisFrame(ctx, padL, padT, plotW, plotH, yMax)

  const n = Math.max(items.length, 1)
  const groupW = plotW / n
  const barW = groupW * 0.45
  const palette = [CHART_COLORS.navy, CHART_COLORS.gold, CHART_COLORS.green]

  items.forEach((item, i) => {
    const cx = padL + i * groupW + groupW / 2
    const h = (Math.abs(item.value) / yMax) * plotH
    const x = cx - barW / 2
    ctx.fillStyle = item.color || palette[i % palette.length]
    ctx.fillRect(x, padT + plotH - h, barW, h)
    ctx.fillStyle = CHART_COLORS.text
    ctx.font = '10px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(asciiSafe(item.label), cx, padT + plotH + 6)
  })
}

/** Multi-Sunday income/spend progression lines. */
export function drawProgressionLines(
  ctx: Ctx,
  width: number,
  height: number,
  points: ProgressionPoint[],
): void {
  clearBg(ctx, width, height)
  if (!points.length) return

  const padL = 44
  const padR = 12
  const padT = 36
  const padB = 40
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const yMax = niceMax(
    maxOf(
      points.flatMap((p) => [
        p.income,
        p.spend,
        p.pastor ?? 0,
        p.instrumentalists ?? 0,
        p.savings ?? 0,
        p.debt ?? 0,
      ]),
    ),
  )

  ctx.fillStyle = CHART_COLORS.navy
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Progression across Sundays', 8, 6)

  drawAxisFrame(ctx, padL, padT, plotW, plotH, yMax)

  const series: { key: keyof ProgressionPoint; color: string; name: string }[] = [
    { key: 'income', color: CHART_COLORS.navy, name: 'Income' },
    { key: 'pastor', color: CHART_COLORS.gold, name: 'Pastor' },
    { key: 'instrumentalists', color: CHART_COLORS.mutedBlue, name: 'Inst' },
    { key: 'savings', color: CHART_COLORS.green, name: 'Savings' },
    { key: 'debt', color: CHART_COLORS.red, name: 'Debt' },
  ]

  const n = points.length
  const xAt = (i: number) =>
    n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW
  const yAt = (v: number) => padT + plotH - (v / yMax) * plotH

  for (const s of series) {
    const vals = points.map((p) => Number(p[s.key]) || 0)
    if (vals.every((v) => v === 0) && s.key !== 'income') continue
    ctx.strokeStyle = s.color
    ctx.lineWidth = 2
    ctx.beginPath()
    vals.forEach((v, i) => {
      const x = xAt(i)
      const y = yAt(v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = s.color
    vals.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  ctx.fillStyle = CHART_COLORS.text
  ctx.font = '9px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  points.forEach((p, i) => {
    ctx.fillText(asciiSafe(p.label).slice(0, 12), xAt(i), padT + plotH + 6)
  })

  // Mini legend
  let lx = 8
  const ly = 22
  ctx.font = '9px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const s of series) {
    ctx.fillStyle = s.color
    ctx.fillRect(lx, ly - 4, 8, 8)
    ctx.fillStyle = CHART_COLORS.text
    ctx.fillText(s.name, lx + 11, ly)
    lx += 11 + ctx.measureText(s.name).width + 10
  }
}

/** Draw onto a new canvas and return PNG data URL (browser or node-canvas). */
export function drawToDataUrl(
  width: number,
  height: number,
  draw: (ctx: Ctx, w: number, h: number) => void,
  canvasFactory?: () => { getContext(type: '2d'): Ctx | null; width: number; height: number; toDataURL(type?: string): string },
): string {
  let canvas: {
    getContext(type: '2d'): Ctx | null
    width: number
    height: number
    toDataURL(type?: string): string
  }
  if (canvasFactory) {
    canvas = canvasFactory()
  } else if (typeof document !== 'undefined') {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    canvas = el
  } else {
    throw new Error('No canvas available — pass canvasFactory for Node')
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  draw(ctx, width, height)
  return canvas.toDataURL('image/png')
}

export function drawGroupedBarsToDataUrl(
  series: GroupedBarItem[],
  width = 700,
  height = 280,
  canvasFactory?: Parameters<typeof drawToDataUrl>[3],
): string {
  return drawToDataUrl(
    width,
    height,
    (ctx, w, h) => drawGroupedBars(ctx, w, h, series),
    canvasFactory,
  )
}

export function drawSimpleBarsToDataUrl(
  items: SimpleBarItem[],
  width = 700,
  height = 220,
  canvasFactory?: Parameters<typeof drawToDataUrl>[3],
): string {
  return drawToDataUrl(
    width,
    height,
    (ctx, w, h) => drawSimpleBars(ctx, w, h, items),
    canvasFactory,
  )
}

export function drawProgressionToDataUrl(
  points: ProgressionPoint[],
  width = 700,
  height = 280,
  canvasFactory?: Parameters<typeof drawToDataUrl>[3],
): string {
  return drawToDataUrl(
    width,
    height,
    (ctx, w, h) => drawProgressionLines(ctx, w, h, points),
    canvasFactory,
  )
}

/* ─── jsPDF primitives (no DOM) ──────────────────────────────────── */

export function drawGroupedBarsWithJsPdf(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  series: GroupedBarItem[],
): void {
  const hasProposed = series.some((s) => s.proposed != null)
  const yMax = niceMax(
    maxOf(series.flatMap((s) => [s.actual, s.proposed ?? 0])),
  )
  const padL = 12
  const padR = 4
  const padT = 10
  const padB = 14
  const plotX = x + padL
  const plotY = y + padT
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  doc.setFillColor(...hexToRgb(CHART_COLORS.white))
  doc.rect(x, y, w, h, 'F')
  doc.setDrawColor(...hexToRgb(CHART_COLORS.grid))
  doc.setLineWidth(0.2)
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const gy = plotY + plotH - t * plotH
    doc.line(plotX, gy, plotX + plotW, gy)
  }
  doc.setDrawColor(...hexToRgb(CHART_COLORS.navy))
  doc.line(plotX, plotY, plotX, plotY + plotH)
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH)

  const n = Math.max(series.length, 1)
  const groupW = plotW / n
  const barW = hasProposed ? groupW * 0.32 : groupW * 0.5
  const gap = hasProposed ? groupW * 0.05 : 0

  series.forEach((item, i) => {
    const cx = plotX + i * groupW + groupW / 2
    const aH = (item.actual / yMax) * plotH
    const ax = hasProposed ? cx - barW - gap / 2 : cx - barW / 2
    doc.setFillColor(...hexToRgb(CHART_COLORS.navy))
    doc.rect(ax, plotY + plotH - aH, barW, aH, 'F')
    if (hasProposed && item.proposed != null) {
      const pH = (item.proposed / yMax) * plotH
      doc.setFillColor(...hexToRgb(CHART_COLORS.gold))
      doc.rect(cx + gap / 2, plotY + plotH - pH, barW, pH, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...hexToRgb(CHART_COLORS.text))
    doc.text(shortLabel(item.label, 9), cx, plotY + plotH + 4, {
      align: 'center',
    })
  })

  if (hasProposed) {
    doc.setFillColor(...hexToRgb(CHART_COLORS.navy))
    doc.rect(x + w - 48, y + 2, 3, 3, 'F')
    doc.setFontSize(6)
    doc.setTextColor(...hexToRgb(CHART_COLORS.text))
    doc.text('Actual', x + w - 44, y + 4.5)
    doc.setFillColor(...hexToRgb(CHART_COLORS.gold))
    doc.rect(x + w - 28, y + 2, 3, 3, 'F')
    doc.text('Proposed', x + w - 24, y + 4.5)
  }
}

export function drawSimpleBarsWithJsPdf(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  items: SimpleBarItem[],
): void {
  const yMax = niceMax(maxOf(items.map((i) => Math.abs(i.value))))
  const padL = 12
  const padR = 4
  const padT = 8
  const padB = 12
  const plotX = x + padL
  const plotY = y + padT
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const palette = [CHART_COLORS.navy, CHART_COLORS.gold, CHART_COLORS.green]

  doc.setFillColor(...hexToRgb(CHART_COLORS.white))
  doc.rect(x, y, w, h, 'F')
  doc.setDrawColor(...hexToRgb(CHART_COLORS.grid))
  doc.setLineWidth(0.2)
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    doc.line(plotX, plotY + plotH - t * plotH, plotX + plotW, plotY + plotH - t * plotH)
  }
  doc.setDrawColor(...hexToRgb(CHART_COLORS.navy))
  doc.line(plotX, plotY, plotX, plotY + plotH)
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH)

  const n = Math.max(items.length, 1)
  const groupW = plotW / n
  const barW = groupW * 0.45
  items.forEach((item, i) => {
    const cx = plotX + i * groupW + groupW / 2
    const bh = (Math.abs(item.value) / yMax) * plotH
    const color = item.color || palette[i % palette.length]
    doc.setFillColor(...hexToRgb(color))
    doc.rect(cx - barW / 2, plotY + plotH - bh, barW, bh, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...hexToRgb(CHART_COLORS.text))
    doc.text(asciiSafe(item.label), cx, plotY + plotH + 4, { align: 'center' })
  })
}

export function drawProgressionWithJsPdf(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  points: ProgressionPoint[],
): void {
  if (!points.length) return
  const yMax = niceMax(
    maxOf(points.flatMap((p) => [p.income, p.spend, p.pastor ?? 0])),
  )
  const padL = 12
  const padR = 4
  const padT = 10
  const padB = 12
  const plotX = x + padL
  const plotY = y + padT
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const n = points.length

  doc.setFillColor(...hexToRgb(CHART_COLORS.white))
  doc.rect(x, y, w, h, 'F')
  doc.setDrawColor(...hexToRgb(CHART_COLORS.grid))
  doc.setLineWidth(0.2)
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    doc.line(plotX, plotY + plotH - t * plotH, plotX + plotW, plotY + plotH - t * plotH)
  }
  doc.setDrawColor(...hexToRgb(CHART_COLORS.navy))
  doc.line(plotX, plotY, plotX, plotY + plotH)
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH)

  const xAt = (i: number) =>
    n === 1 ? plotX + plotW / 2 : plotX + (i / (n - 1)) * plotW
  const yAt = (v: number) => plotY + plotH - (v / yMax) * plotH

  const lines: { vals: number[]; color: string }[] = [
    { vals: points.map((p) => p.income), color: CHART_COLORS.navy },
    { vals: points.map((p) => p.pastor ?? 0), color: CHART_COLORS.gold },
    {
      vals: points.map((p) => p.instrumentalists ?? 0),
      color: CHART_COLORS.mutedBlue,
    },
    { vals: points.map((p) => p.savings ?? 0), color: CHART_COLORS.green },
    { vals: points.map((p) => p.debt ?? 0), color: CHART_COLORS.red },
  ]

  for (const line of lines) {
    doc.setDrawColor(...hexToRgb(line.color))
    doc.setLineWidth(0.6)
    for (let i = 0; i < n - 1; i++) {
      doc.line(xAt(i), yAt(line.vals[i]), xAt(i + 1), yAt(line.vals[i + 1]))
    }
    doc.setFillColor(...hexToRgb(line.color))
    for (let i = 0; i < n; i++) {
      doc.circle(xAt(i), yAt(line.vals[i]), 0.8, 'F')
    }
  }

  doc.setFontSize(6)
  doc.setTextColor(...hexToRgb(CHART_COLORS.text))
  points.forEach((p, i) => {
    doc.text(asciiSafe(p.label).slice(0, 10), xAt(i), plotY + plotH + 4, {
      align: 'center',
    })
  })
}
