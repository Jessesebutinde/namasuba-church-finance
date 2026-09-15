import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { aggregateReports, proposedByCategory } from '../lib/modelEngine'
import { fmtAmount, fmtDate, balanceTone } from '../lib/format'

export function Dashboard() {
  const { sundays, settings } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    return sundays.filter((s) => {
      if (from && s.date < from) return false
      if (to && s.date > to) return false
      return true
    })
  }, [sundays, from, to])

  const { actual, proposed, sundayCount } = useMemo(
    () => aggregateReports(filtered, settings),
    [filtered, settings],
  )

  const propCats = proposedByCategory(proposed)
  const tone = balanceTone(actual.balance)

  const chartData = [
    'Pastor',
    'Instrumentalists',
    'Debt',
    'Ushering',
    'Savings',
    'Other ministries and operations',
  ].map((name) => ({
    name: name.replace('Other ministries and operations', 'Other / ops'),
    Actual: actual.byCategory[name] || 0,
    Proposed: propCats[name] || 0,
  }))

  const card = (
    label: string,
    value: string,
    hint?: string,
    toneClass = 'border-navy-900/10',
  ) => (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-navy-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  )

  return (
    <div className="space-y-4" data-testid="dashboard">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-navy-900/10 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-navy-900/20 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-navy-900/20 px-2 py-1"
          />
        </label>
        <button
          type="button"
          className="rounded bg-navy-900 px-3 py-2 text-sm text-white"
          onClick={() => {
            setFrom('')
            setTo('')
          }}
        >
          Clear filters
        </button>
        <p className="text-sm text-muted">
          Showing {sundayCount} Sunday{sundayCount === 1 ? '' : 's'}
          {settings.noDebtMode ? ' · no-debt trial structure' : ' · debt mode'}
          {settings.deductOperatingExpenses ? ' · ops deducted before model' : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {card('Income', fmtAmount(actual.income, settings.currencyLabel), 'All income types')}
        {card(
          'Actual spend',
          fmtAmount(actual.spend, settings.currencyLabel),
          'Recorded distribution',
        )}
        {card(
          'Proposed (model)',
          fmtAmount(proposed.totalProposed, settings.currencyLabel),
          'General offertory model only',
        )}
        {card(
          'Balance',
          fmtAmount(actual.balance, settings.currencyLabel),
          'Income − actual spend',
          tone === 'balanced'
            ? 'border-balanced/40 bg-green-50'
            : tone === 'review'
              ? 'border-review/40 bg-amber-50'
              : 'border-error/40 bg-red-50',
        )}
        {card(
          'Savings (proposed)',
          fmtAmount(proposed.savings, settings.currencyLabel),
        )}
        {card(
          'Debt (proposed)',
          fmtAmount(proposed.debt, settings.currencyLabel),
          settings.noDebtMode ? 'No-debt mode active' : 'Debt mode',
        )}
        {card(
          'Named gifts',
          fmtAmount(actual.namedGifts, settings.currencyLabel),
          'Never auto-applied to model',
        )}
        {card('Sunday count', String(sundayCount))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {card(
          'Diff Pastor (actual − proposed)',
          fmtAmount(
            (actual.byCategory['Pastor'] || 0) - proposed.pastor,
            settings.currencyLabel,
          ),
        )}
        {card(
          'Diff Instrumentalists',
          fmtAmount(
            (actual.byCategory['Instrumentalists'] || 0) - proposed.instrumentalists,
            settings.currencyLabel,
          ),
        )}
      </div>

      <div className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">
          Actual vs proposed by category
        </h2>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Actual" fill="#0b1f3a" radius={2} />
              <Bar dataKey="Proposed" fill="#c9a227" radius={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-navy-900/10 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-navy-900 text-white">
            <tr>
              <th className="px-3 py-2">Sunday</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Income</th>
              <th className="px-3 py-2">Spend</th>
              <th className="px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {[...filtered]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) => {
                const inc = s.incomes.reduce((a, l) => a + l.amount, 0)
                const exp = s.expenses.reduce((a, l) => a + l.amount, 0)
                const bal = Math.round((inc - exp) * 100) / 100
                const t = balanceTone(bal)
                return (
                  <tr key={s.id} className="border-t border-navy-900/10">
                    <td className="px-3 py-2 font-medium">{fmtDate(s.date)}</td>
                    <td className="px-3 py-2">{s.status}</td>
                    <td className="px-3 py-2">
                      {fmtAmount(inc, settings.currencyLabel)}
                    </td>
                    <td className="px-3 py-2">
                      {fmtAmount(exp, settings.currencyLabel)}
                    </td>
                    <td
                      className={`px-3 py-2 font-medium ${
                        t === 'balanced'
                          ? 'text-balanced'
                          : t === 'review'
                            ? 'text-review'
                            : 'text-error'
                      }`}
                    >
                      {fmtAmount(bal, settings.currencyLabel)}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
