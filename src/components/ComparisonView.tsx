import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  computeActual,
  computeProposed,
  proposedByCategory,
  aggregateReports,
} from '../lib/modelEngine'
import { fmtAmount, fmtDate } from '../lib/format'

const CATS = [
  'Pastor',
  'Instrumentalists',
  'Debt',
  'Ushering',
  'Savings',
  'Other ministries and operations',
]

export function ComparisonView() {
  const { sundays, settings } = useApp()
  const sorted = useMemo(
    () => [...sundays].sort((a, b) => a.date.localeCompare(b.date)),
    [sundays],
  )
  const [focusId, setFocusId] = useState(sorted[0]?.id ?? '')

  const focus = sorted.find((s) => s.id === focusId) ?? sorted[0]
  const combined = useMemo(
    () => aggregateReports(sorted, settings),
    [sorted, settings],
  )

  const renderTable = (
    title: string,
    actualBy: Record<string, number>,
    proposedBy: Record<string, number>,
  ) => (
    <div className="overflow-x-auto rounded-xl border border-navy-900/10 bg-white shadow-sm">
      <div className="border-b border-navy-900/10 bg-navy-900 px-4 py-3 text-white">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-white/80">
          Category | Actual | Proposed | Difference — for discussion
        </p>
      </div>
      <table className="min-w-full text-sm" data-testid="comparison-table">
        <thead className="bg-gold-100 text-navy-900">
          <tr>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-right">Actual</th>
            <th className="px-3 py-2 text-right">Proposed</th>
            <th className="px-3 py-2 text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          {CATS.map((c) => {
            const act = actualBy[c] || 0
            const prop = proposedBy[c] || 0
            const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
            return (
              <tr key={c} className="border-t border-navy-900/10">
                <td className="px-3 py-2">{c}</td>
                <td className="px-3 py-2 text-right">
                  {fmtAmount(act, settings.currencyLabel)}
                </td>
                <td className="px-3 py-2 text-right">
                  {fmtAmount(prop, settings.currencyLabel)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    Math.abs(diff) < 0.005 ? 'text-balanced' : 'text-review'
                  }`}
                >
                  {fmtAmount(diff, settings.currencyLabel)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  if (!focus) {
    return <p className="text-muted">No Sundays recorded yet.</p>
  }

  const actual = computeActual(focus)
  const proposed = computeProposed(focus, settings)

  return (
    <div className="space-y-4" data-testid="comparison">
      <div className="rounded-xl border border-navy-900/10 bg-white p-4">
        <label className="text-sm">
          <span className="mr-2 text-muted">Sunday</span>
          <select
            value={focus.id}
            onChange={(e) => setFocusId(e.target.value)}
            className="rounded border border-navy-900/20 px-2 py-1"
          >
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {fmtDate(s.date)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-muted">
          Proposed uses general offertory only
          {settings.deductOperatingExpenses
            ? '; operating expenses deducted before bands.'
            : '.'}{' '}
          Named gifts are excluded from the model.
        </p>
      </div>

      {renderTable(
        `Sunday ${fmtDate(focus.date)}`,
        actual.byCategory,
        proposedByCategory(proposed),
      )}

      {renderTable(
        'Combined period (all Sundays)',
        combined.actual.byCategory,
        proposedByCategory(combined.proposed),
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {sorted.map((s) => {
          const a = computeActual(s)
          const p = computeProposed(s, settings)
          const pc = proposedByCategory(p)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setFocusId(s.id)}
              className={`rounded-xl border bg-white p-3 text-left shadow-sm ${
                s.id === focus.id ? 'border-gold-500' : 'border-navy-900/10'
              }`}
            >
              <div className="font-medium text-navy-900">{fmtDate(s.date)}</div>
              <div className="mt-1 text-xs text-muted">
                Actual Pastor {fmtAmount(a.byCategory['Pastor'] || 0, settings.currencyLabel)} ·
                Proposed {fmtAmount(pc['Pastor'] || 0, settings.currencyLabel)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
