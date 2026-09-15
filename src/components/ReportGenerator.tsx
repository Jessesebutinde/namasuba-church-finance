import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext'
import {
  aggregateReports,
  computeActual,
  computeProposed,
  proposedByCategory,
  BUCKET_KEYS,
} from '../lib/modelEngine'
import { DISCLAIMER } from '../lib/defaults'
import { fmtAmount, fmtDate } from '../lib/format'
import {
  buildPdfReport,
  downloadElementPng,
  type ReportContentMode,
} from '../lib/exportReport'
import type { SundayReport } from '../lib/types'

const CATS = [...BUCKET_KEYS]

type ScopeKind = 'this_sunday' | 'selected' | 'date_range'

function shortCat(name: string): string {
  return name.replace('Other ministries and operations', 'Other / ops')
}

function latestSunday(sorted: SundayReport[]): SundayReport | undefined {
  return sorted.length ? sorted[sorted.length - 1] : undefined
}

export function ReportGenerator() {
  const { sundays, settings } = useApp()
  const previewRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  const sorted = useMemo(
    () => [...sundays].sort((a, b) => a.date.localeCompare(b.date)),
    [sundays],
  )

  const [scopeKind, setScopeKind] = useState<ScopeKind>('this_sunday')
  const [thisSundayId, setThisSundayId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [contentMode, setContentMode] =
    useState<ReportContentMode>('actual_proposed')
  const [includeProgression, setIncludeProgression] = useState(false)
  const [progressionTouched, setProgressionTouched] = useState(false)

  // Seed defaults when Sundays load / change
  useEffect(() => {
    if (!sorted.length) return
    const last = latestSunday(sorted)!
    setThisSundayId((prev) =>
      prev && sorted.some((s) => s.id === prev) ? prev : last.id,
    )
    setSelectedIds((prev) => {
      const still = prev.filter((id) => sorted.some((s) => s.id === id))
      if (still.length) return still
      return sorted.map((s) => s.id)
    })
    setRangeFrom((prev) => prev || sorted[0].date)
    setRangeTo((prev) => prev || last.date)
  }, [sorted])

  const selectedReports = useMemo(() => {
    if (!sorted.length) return [] as SundayReport[]
    if (scopeKind === 'this_sunday') {
      const one =
        sorted.find((s) => s.id === thisSundayId) ?? latestSunday(sorted)
      return one ? [one] : []
    }
    if (scopeKind === 'selected') {
      return sorted.filter((s) => selectedIds.includes(s.id))
    }
    // date_range
    return sorted.filter((s) => {
      if (rangeFrom && s.date < rangeFrom) return false
      if (rangeTo && s.date > rangeTo) return false
      return true
    })
  }, [sorted, scopeKind, thisSundayId, selectedIds, rangeFrom, rangeTo])

  const isMulti = selectedReports.length > 1

  // Auto-enable progression for multi unless user overrode
  useEffect(() => {
    if (!progressionTouched) {
      setIncludeProgression(isMulti)
    }
  }, [isMulti, progressionTouched])

  const { actual, proposed, sundayCount } = useMemo(
    () => aggregateReports(selectedReports, settings),
    [selectedReports, settings],
  )
  const propCats = proposedByCategory(proposed)

  const breakdownChartData = useMemo(() => {
    return CATS.map((name) => {
      const row: Record<string, string | number> = {
        name: shortCat(name),
        Actual: actual.byCategory[name] || 0,
      }
      if (contentMode === 'actual_proposed') {
        row.Proposed = propCats[name] || 0
      }
      return row
    })
  }, [actual, propCats, contentMode])

  const incomeExpenseChartData = useMemo(() => {
    if (selectedReports.length !== 1) return []
    const s = selectedReports[0]
    const a = computeActual(s)
    return [
      { name: 'Income', Amount: a.income },
      { name: 'Expenses', Amount: a.spend },
      { name: 'Balance', Amount: a.balance },
    ]
  }, [selectedReports])

  const progressionData = useMemo(() => {
    return selectedReports.map((s) => {
      const a = computeActual(s)
      const row: Record<string, string | number> = {
        date: fmtDate(s.date),
        Income: a.income,
        Spend: a.spend,
        Pastor: a.byCategory['Pastor'] || 0,
        Instrumentalists: a.byCategory['Instrumentalists'] || 0,
        Savings: a.byCategory['Savings'] || 0,
        Debt: a.byCategory['Debt'] || 0,
      }
      if (contentMode === 'actual_proposed') {
        const p = computeProposed(s, settings)
        row['Proposed total'] = p.totalProposed
      }
      return row
    })
  }, [selectedReports, contentMode, settings])

  const scopeSummary = useMemo(() => {
    if (!selectedReports.length) return 'No Sundays selected'
    if (selectedReports.length === 1) {
      return `Sunday ${fmtDate(selectedReports[0].date)}`
    }
    const first = selectedReports[0]
    const last = selectedReports[selectedReports.length - 1]
    return `${selectedReports.length} Sundays · ${fmtDate(first.date)} – ${fmtDate(last.date)}`
  }, [selectedReports])

  const filenameBase = `${settings.churchName.replace(/\s+/g, '-')}-finance-${
    contentMode === 'actual' ? 'actual' : 'actual-proposed'
  }`

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectAll = () => setSelectedIds(sorted.map((s) => s.id))
  const clearSelected = () => setSelectedIds([])

  const runPdf = () => {
    setBusy('pdf')
    try {
      buildPdfReport(selectedReports, settings, {
        contentMode,
        includeProgression: includeProgression && isMulti,
      })
    } finally {
      setBusy('')
    }
  }

  const runPng = async () => {
    if (!previewRef.current) return
    setShowPreview(true)
    // Allow preview to render if it was hidden
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    setBusy('png')
    try {
      await downloadElementPng(previewRef.current, `${filenameBase}.png`)
    } finally {
      setBusy('')
    }
  }

  const onPreview = () => {
    setShowPreview(true)
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const onPrint = () => {
    setShowPreview(true)
    requestAnimationFrame(() => window.print())
  }

  return (
    <div className="space-y-4" data-testid="reports">
      <div className="no-print space-y-4 rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-navy-900">Report scope</h2>
          <p className="mt-1 text-sm text-muted">
            Choose one Sunday, several Sundays, or a date range. Exports and
            print follow these options.
          </p>
        </div>

        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Scope</legend>
          {(
            [
              ['this_sunday', 'This Sunday'],
              ['selected', 'Selected Sundays'],
              ['date_range', 'Date range'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                scopeKind === value
                  ? 'border-gold-500 bg-gold-100 text-navy-900'
                  : 'border-navy-900/15'
              }`}
            >
              <input
                type="radio"
                name="scopeKind"
                className="mr-2"
                checked={scopeKind === value}
                onChange={() => setScopeKind(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {scopeKind === 'this_sunday' && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Sunday</span>
            <select
              value={thisSundayId}
              onChange={(e) => setThisSundayId(e.target.value)}
              className="w-full max-w-md rounded border border-navy-900/20 px-2 py-1.5"
              data-testid="report-this-sunday"
            >
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.date)} · {s.status}
                </option>
              ))}
            </select>
          </label>
        )}

        {scopeKind === 'selected' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-navy-900/20 px-2 py-1 text-xs"
                onClick={selectAll}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded border border-navy-900/20 px-2 py-1 text-xs"
                onClick={clearSelected}
              >
                Clear
              </button>
            </div>
            <div
              className="grid max-h-48 gap-1 overflow-y-auto rounded border border-navy-900/10 p-2 sm:grid-cols-2"
              data-testid="report-multi-select"
            >
              {sorted.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gold-100/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleSelected(s.id)}
                  />
                  <span>
                    {fmtDate(s.date)}{' '}
                    <span className="text-muted">· {s.status}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {scopeKind === 'date_range' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">From</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="rounded border border-navy-900/20 px-2 py-1.5"
                data-testid="report-range-from"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">To</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="rounded border border-navy-900/20 px-2 py-1.5"
                data-testid="report-range-to"
              />
            </label>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-navy-900">Content</h3>
          <fieldset className="mt-2 flex flex-wrap gap-3">
            <legend className="sr-only">Content mode</legend>
            <label
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                contentMode === 'actual'
                  ? 'border-gold-500 bg-gold-100'
                  : 'border-navy-900/15'
              }`}
            >
              <input
                type="radio"
                name="contentMode"
                className="mr-2"
                checked={contentMode === 'actual'}
                onChange={() => setContentMode('actual')}
              />
              Actual only
            </label>
            <label
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                contentMode === 'actual_proposed'
                  ? 'border-gold-500 bg-gold-100'
                  : 'border-navy-900/15'
              }`}
            >
              <input
                type="radio"
                name="contentMode"
                className="mr-2"
                checked={contentMode === 'actual_proposed'}
                onChange={() => setContentMode('actual_proposed')}
              />
              Actual + proposed comparison
            </label>
          </fieldset>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeProgression}
            disabled={!isMulti}
            onChange={(e) => {
              setProgressionTouched(true)
              setIncludeProgression(e.target.checked)
            }}
            data-testid="report-progression"
          />
          <span>
            Include progression chart
            {!isMulti ? (
              <span className="text-muted"> (available for multi-Sunday)</span>
            ) : !progressionTouched ? (
              <span className="text-muted"> (on for multi)</span>
            ) : null}
          </span>
        </label>

        <p className="text-sm text-muted" data-testid="report-scope-summary">
          Active scope: <strong className="text-navy-900">{scopeSummary}</strong>
          {' · '}
          {contentMode === 'actual' ? 'Actual only' : 'Actual + proposed'}
        </p>

        <div className="flex flex-wrap gap-2 border-t border-navy-900/10 pt-3">
          <button
            type="button"
            className="rounded border border-navy-900/20 px-3 py-2 text-sm"
            onClick={onPreview}
            data-testid="report-preview"
          >
            Preview
          </button>
          <button
            type="button"
            className="rounded border border-navy-900/20 px-3 py-2 text-sm disabled:opacity-50"
            disabled={!!busy || !selectedReports.length}
            onClick={() => void runPng()}
            data-testid="report-png"
          >
            {busy === 'png' ? 'Capturing…' : 'Download PNG'}
          </button>
          <button
            type="button"
            className="rounded bg-navy-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={!!busy || !selectedReports.length}
            onClick={runPdf}
            data-testid="report-pdf"
          >
            {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="rounded border border-navy-900/20 px-3 py-2 text-sm"
            onClick={onPrint}
            data-testid="report-print"
          >
            Print
          </button>
        </div>
      </div>

      {showPreview ? (
        <div
          ref={previewRef}
          className="report-preview rounded-xl border border-navy-900/10 bg-white p-5 shadow-sm sm:p-6"
          style={{ background: '#ffffff', maxWidth: 720, margin: '0 auto' }}
          data-testid="report-preview-panel"
        >
          <header className="border-b border-gold-500/50 pb-4">
            <h1 className="text-xl font-semibold text-navy-900 sm:text-2xl">
              {settings.churchName}
            </h1>
            <h2 className="mt-1 text-base text-navy-800 sm:text-lg">
              {contentMode === 'actual'
                ? 'Sunday Finance Report — Actual (Draft)'
                : 'Sunday Finance Report — Draft for Discussion'}
            </h2>
            <p className="mt-1 text-sm text-gold-500">
              {contentMode === 'actual'
                ? 'Actual incomes & expenses · Trial structure'
                : 'Proposed model · Actual distribution · Trial structure'}
            </p>
            <p className="mt-3 rounded bg-gold-100 px-3 py-2 text-xs text-navy-900">
              {DISCLAIMER}
            </p>
            <p className="mt-2 text-sm text-muted">
              Scope: {scopeSummary} · Currency: {settings.currencyLabel}
            </p>
          </header>

          {!selectedReports.length ? (
            <p className="mt-6 text-muted">No Sundays in this report scope.</p>
          ) : (
            <>
              <section className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted">Sundays in report:</span>{' '}
                  {sundayCount}
                </p>
                <p>
                  <span className="text-muted">Income:</span>{' '}
                  {fmtAmount(actual.income, settings.currencyLabel)}
                </p>
                <p>
                  <span className="text-muted">Actual spend:</span>{' '}
                  {fmtAmount(actual.spend, settings.currencyLabel)}
                </p>
                <p>
                  <span className="text-muted">Balance:</span>{' '}
                  {fmtAmount(actual.balance, settings.currencyLabel)}
                </p>
                <p>
                  <span className="text-muted">Named gifts:</span>{' '}
                  {fmtAmount(actual.namedGifts, settings.currencyLabel)}
                </p>
                {contentMode === 'actual_proposed' ? (
                  <p>
                    <span className="text-muted">Proposed (model):</span>{' '}
                    {fmtAmount(proposed.totalProposed, settings.currencyLabel)}
                  </p>
                ) : null}
              </section>

              {/* Single-Sunday income/expense breakdown */}
              {!isMulti && incomeExpenseChartData.length > 0 ? (
                <section className="mt-6 break-inside-avoid">
                  <h3 className="text-base font-semibold text-navy-900">
                    Income & expense overview
                  </h3>
                  <div className="mt-2 h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeExpenseChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="Amount" fill="#0b1f3a" radius={2} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              ) : null}

              {/* Category breakdown chart */}
              <section className="mt-6 break-inside-avoid">
                <h3 className="text-base font-semibold text-navy-900">
                  {contentMode === 'actual'
                    ? 'Actual by category'
                    : 'Actual vs proposed by category'}
                </h3>
                <div className="mt-2 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Actual" fill="#0b1f3a" radius={2} />
                      {contentMode === 'actual_proposed' ? (
                        <Bar dataKey="Proposed" fill="#c9a227" radius={2} />
                      ) : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Progression chart for multi */}
              {includeProgression && isMulti ? (
                <section className="mt-6 break-inside-avoid">
                  <h3 className="text-base font-semibold text-navy-900">
                    Progression across Sundays
                  </h3>
                  <p className="text-xs text-muted">
                    Income and key buckets over the selected period
                  </p>
                  <div className="mt-2 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={progressionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="Income"
                          stroke="#0b1f3a"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Pastor"
                          stroke="#c9a227"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Instrumentalists"
                          stroke="#1a3a5c"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Savings"
                          stroke="#1f7a4d"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Debt"
                          stroke="#b42318"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              ) : null}

              {contentMode === 'actual_proposed' ? (
                <section className="mt-6">
                  <h3 className="text-base font-semibold text-navy-900">
                    Combined comparison (for discussion)
                  </h3>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="bg-navy-900 text-white">
                        <th className="px-2 py-2 text-left">Category</th>
                        <th className="px-2 py-2 text-right">Actual</th>
                        <th className="px-2 py-2 text-right">Proposed</th>
                        <th className="px-2 py-2 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATS.map((c) => {
                        const act = actual.byCategory[c] || 0
                        const prop = propCats[c] || 0
                        const diff =
                          Math.round((act - prop + Number.EPSILON) * 100) / 100
                        return (
                          <tr key={c} className="border-b border-navy-900/10">
                            <td className="px-2 py-2">{c}</td>
                            <td className="px-2 py-2 text-right">
                              {fmtAmount(act, settings.currencyLabel)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {fmtAmount(prop, settings.currencyLabel)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {fmtAmount(diff, settings.currencyLabel)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </section>
              ) : (
                <section className="mt-6">
                  <h3 className="text-base font-semibold text-navy-900">
                    Combined actual by category
                  </h3>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="bg-navy-900 text-white">
                        <th className="px-2 py-2 text-left">Category</th>
                        <th className="px-2 py-2 text-right">Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATS.map((c) => (
                        <tr key={c} className="border-b border-navy-900/10">
                          <td className="px-2 py-2">{c}</td>
                          <td className="px-2 py-2 text-right">
                            {fmtAmount(
                              actual.byCategory[c] || 0,
                              settings.currencyLabel,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {selectedReports.map((s) => {
                const a = computeActual(s)
                const p = computeProposed(s, settings)
                const pc = proposedByCategory(p)
                return (
                  <section key={s.id} className="mt-6 break-inside-avoid">
                    <h3 className="text-base font-semibold text-navy-900">
                      Sunday {fmtDate(s.date)} · {s.status}
                    </h3>
                    <p className="text-xs text-muted">
                      Entered by {s.enteredBy || '—'}
                      {contentMode === 'actual_proposed'
                        ? ` · Band ${p.bandLabel || '—'}`
                        : ''}
                    </p>
                    <p className="mt-1 text-sm">
                      Income {fmtAmount(a.income, settings.currencyLabel)} ·
                      Spend {fmtAmount(a.spend, settings.currencyLabel)} ·
                      Balance {fmtAmount(a.balance, settings.currencyLabel)}
                    </p>

                    {contentMode === 'actual' ? (
                      <>
                        <table className="mt-2 w-full text-sm">
                          <thead>
                            <tr className="bg-gold-100 text-navy-900">
                              <th className="px-2 py-1 text-left">Category</th>
                              <th className="px-2 py-1 text-right">Actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {CATS.map((c) => (
                              <tr
                                key={c}
                                className="border-b border-navy-900/10"
                              >
                                <td className="px-2 py-1">{c}</td>
                                <td className="px-2 py-1 text-right">
                                  {fmtAmount(
                                    a.byCategory[c] || 0,
                                    settings.currencyLabel,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {s.incomes.length ? (
                          <div className="mt-2 text-xs">
                            <p className="font-medium text-navy-900">
                              Income lines
                            </p>
                            <ul className="mt-1 space-y-0.5 text-muted">
                              {s.incomes.map((inc) => (
                                <li key={inc.id}>
                                  {inc.label || inc.type}:{' '}
                                  {fmtAmount(inc.amount, settings.currencyLabel)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {s.expenses.length ? (
                          <div className="mt-2 text-xs">
                            <p className="font-medium text-navy-900">
                              Expense lines
                            </p>
                            <ul className="mt-1 space-y-0.5 text-muted">
                              {s.expenses.map((exp) => (
                                <li key={exp.id}>
                                  {exp.category} / {exp.subcategory}:{' '}
                                  {fmtAmount(exp.amount, settings.currencyLabel)}
                                  {exp.description
                                    ? ` — ${exp.description}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <table className="mt-2 w-full text-sm">
                        <thead>
                          <tr className="bg-gold-100 text-navy-900">
                            <th className="px-2 py-1 text-left">Category</th>
                            <th className="px-2 py-1 text-right">Actual</th>
                            <th className="px-2 py-1 text-right">Proposed</th>
                            <th className="px-2 py-1 text-right">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CATS.map((c) => {
                            const act = a.byCategory[c] || 0
                            const prop = pc[c] || 0
                            const diff =
                              Math.round((act - prop + Number.EPSILON) * 100) /
                              100
                            return (
                              <tr
                                key={c}
                                className="border-b border-navy-900/10"
                              >
                                <td className="px-2 py-1">{c}</td>
                                <td className="px-2 py-1 text-right">
                                  {fmtAmount(act, settings.currencyLabel)}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {fmtAmount(prop, settings.currencyLabel)}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {fmtAmount(diff, settings.currencyLabel)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                    {s.notes ? (
                      <p className="mt-2 text-xs text-muted">Notes: {s.notes}</p>
                    ) : null}
                  </section>
                )
              })}

              <section className="mt-8 border-t border-navy-900/10 pt-4">
                <h3 className="text-base font-semibold text-navy-900">
                  Signatures (discussion / possible trial)
                </h3>
                <div className="mt-4 grid gap-6 text-sm sm:grid-cols-2">
                  <p>Elder / Admin: ______________________ Date: __________</p>
                  <p>Elder / Admin: ______________________ Date: __________</p>
                  <p>Prepared by: ________________________ Date: __________</p>
                </div>
                <p className="mt-6 text-xs text-muted">{DISCLAIMER}</p>
              </section>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
