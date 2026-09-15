import { useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useApp } from '../context/AppContext'
import type { ExpenseLine, IncomeLine, IncomeType, SundayReport } from '../lib/types'
import {
  computeActual,
  computeProposed,
  categoryPercents,
  proposedByCategory,
} from '../lib/modelEngine'
import { fmtAmount, fmtDate, todayISO, balanceTone } from '../lib/format'

function blankIncome(): IncomeLine {
  return {
    id: uuid(),
    type: 'general_offertory',
    label: 'General offertory',
    amount: 0,
  }
}

function blankExpense(category = 'Pastor' as ExpenseLine['category']): ExpenseLine {
  return {
    id: uuid(),
    category,
    subcategory: 'Weekly support',
    description: '',
    amount: 0,
  }
}

export function SundayForm() {
  const { sundays, settings, saveSunday, deleteSunday, isAdmin } = useApp()
  const sorted = useMemo(
    () => [...sundays].sort((a, b) => b.date.localeCompare(a.date)),
    [sundays],
  )
  const [selectedId, setSelectedId] = useState<string | 'new'>(sorted[0]?.id ?? 'new')

  const editing: SundayReport = useMemo(() => {
    if (selectedId === 'new') {
      return {
        id: uuid(),
        date: todayISO(),
        incomes: [blankIncome()],
        expenses: [
          blankExpense('Pastor'),
          blankExpense('Instrumentalists'),
          {
            ...blankExpense('Other ministries and operations'),
            subcategory: 'Drinking water',
            description: 'Sunday drinking water',
          },
        ],
        notes: '',
        enteredBy: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        outstandingDebt: 0,
        status: 'Draft',
      }
    }
    return sorted.find((s) => s.id === selectedId) ?? sorted[0]
  }, [selectedId, sorted])

  const [draft, setDraft] = useState<SundayReport>(editing)

  useEffect(() => {
    setDraft(editing)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const actual = computeActual(draft)
  const proposed = computeProposed(draft, settings)
  const percents = categoryPercents(actual.byCategory, actual.spend)
  const tone = balanceTone(actual.balance)
  const unbalanced = Math.abs(actual.balance) >= 0.005

  const updateIncome = (id: string, patch: Partial<IncomeLine>) => {
    setDraft((d) => ({
      ...d,
      incomes: d.incomes.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }

  const updateExpense = (id: string, patch: Partial<ExpenseLine>) => {
    setDraft((d) => ({
      ...d,
      expenses: d.expenses.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }

  const onSave = () => {
    if (!isAdmin) {
      window.alert('Viewer role cannot save entries. Switch to Admin.')
      return
    }
    const next = {
      ...draft,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt || new Date().toISOString(),
    }
    saveSunday(next, draft.enteredBy || 'Admin')
    setSelectedId(next.id)
    setDraft(next)
  }

  const subcatsFor = (category: ExpenseLine['category']) => {
    const cfg = settings.categories.find((c) => c.id === category)
    return cfg?.subcategories ?? ['Other']
  }

  return (
    <div className="space-y-4" data-testid="sunday-form">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-900/10 bg-white p-4">
        <label className="text-sm">
          <span className="mr-2 text-muted">Load Sunday</span>
          <select
            className="rounded border border-navy-900/20 px-2 py-1"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="new">+ New Sunday</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {fmtDate(s.date)} · {s.status}
              </option>
            ))}
          </select>
        </label>
        {!isAdmin && (
          <span className="text-sm text-review">Viewer mode — editing disabled</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-navy-900">Sunday details</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Date</span>
                <input
                  type="date"
                  disabled={!isAdmin}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className="w-full rounded border border-navy-900/20 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Entered by</span>
                <input
                  disabled={!isAdmin}
                  value={draft.enteredBy}
                  onChange={(e) => setDraft({ ...draft, enteredBy: e.target.value })}
                  className="w-full rounded border border-navy-900/20 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Report status</span>
                <select
                  disabled={!isAdmin}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value as SundayReport['status'],
                    })
                  }
                  className="w-full rounded border border-navy-900/20 px-2 py-1"
                >
                  {['Draft', 'Ready', 'Approved', 'Archived'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={!!draft.overrideHighAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, overrideHighAmount: e.target.checked })
                  }
                />
                Admin override for Above 300k (still for discussion)
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted">
                  Outstanding church bills / debt this Sunday (thousands of UGX)
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  disabled={!isAdmin}
                  title="Thousands of UGX — 0 means proposed debt stays 0"
                  placeholder="0"
                  value={draft.outstandingDebt ?? 0}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      outstandingDebt: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded border border-navy-900/20 px-2 py-1"
                />
                <p className="mt-1 text-xs text-muted">
                  Enter 0 when there is no outstanding debt — proposed Debt stays 0 and
                  the debt slice is redistributed per band no-debt rules. When set above
                  0, proposed debt is capped at this amount.
                </p>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-muted">Notes</span>
              <textarea
                disabled={!isAdmin}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="min-h-20 w-full rounded border border-navy-900/20 px-2 py-1"
              />
            </label>
            <p className="mt-2 text-xs text-muted">
              Last updated: {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : '—'}
            </p>
          </section>

          <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-navy-900">Income</h2>
              {isAdmin && (
                <button
                  type="button"
                  className="text-sm text-navy-800 underline"
                  onClick={() =>
                    setDraft((d) => ({ ...d, incomes: [...d.incomes, blankIncome()] }))
                  }
                >
                  Add income line
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {draft.incomes.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded border border-navy-900/10 p-2 sm:grid-cols-4"
                >
                  <select
                    disabled={!isAdmin}
                    value={line.type}
                    onChange={(e) => {
                      const type = e.target.value as IncomeType
                      updateIncome(line.id, {
                        type,
                        label:
                          type === 'general_offertory'
                            ? 'General offertory'
                            : type === 'named_ministry_gift'
                              ? 'Named ministry gift'
                              : 'Other income',
                      })
                    }}
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  >
                    <option value="general_offertory">General offertory</option>
                    <option value="named_ministry_gift">Named ministry gift</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    disabled={!isAdmin}
                    placeholder="Label / ministry"
                    value={line.ministryName || line.label}
                    onChange={(e) =>
                      updateIncome(line.id, {
                        label: e.target.value,
                        ministryName: e.target.value,
                      })
                    }
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    step="0.1"
                    disabled={!isAdmin}
                    placeholder="e.g. 20 = 20,000 UGX"
                    title="Thousands of UGX"
                    value={line.amount}
                    onChange={(e) =>
                      updateIncome(line.id, { amount: Number(e.target.value) || 0 })
                    }
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-sm text-error"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.filter((x) => x.id !== line.id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                  {line.type === 'named_ministry_gift' && (
                    <p className="sm:col-span-4 text-xs text-review">
                      Named gifts are recorded separately and never auto-apply the
                      general model.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-navy-900">Expenses</h2>
              <p className="text-xs text-muted">Amounts in thousands of UGX — enter 20 for 20,000 UGX.</p>
              {isAdmin && (
                <button
                  type="button"
                  className="text-sm text-navy-800 underline"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      expenses: [...d.expenses, blankExpense()],
                    }))
                  }
                >
                  Add expense line
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {draft.expenses.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded border border-navy-900/10 p-2 sm:grid-cols-5"
                >
                  <select
                    disabled={!isAdmin}
                    value={line.category}
                    onChange={(e) => {
                      const category = e.target.value as ExpenseLine['category']
                      const subs = subcatsFor(category)
                      updateExpense(line.id, {
                        category,
                        subcategory: subs[0] || '',
                      })
                    }}
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  >
                    {settings.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    disabled={!isAdmin}
                    value={line.subcategory}
                    onChange={(e) =>
                      updateExpense(line.id, { subcategory: e.target.value })
                    }
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  >
                    {subcatsFor(line.category).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    disabled={!isAdmin}
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      updateExpense(line.id, { description: e.target.value })
                    }
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    step="0.1"
                    disabled={!isAdmin}
                    placeholder="e.g. 20 = 20,000 UGX"
                    title="Thousands of UGX"
                    value={line.amount}
                    onChange={(e) =>
                      updateExpense(line.id, { amount: Number(e.target.value) || 0 })
                    }
                    className="rounded border border-navy-900/20 px-2 py-1 text-sm"
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-sm text-error"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          expenses: d.expenses.filter((x) => x.id !== line.id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!isAdmin}
              onClick={onSave}
              className="rounded-md bg-navy-900 px-4 py-2 text-white disabled:opacity-50"
            >
              Save Sunday report
            </button>
            {isAdmin && selectedId !== 'new' && (
              <button
                type="button"
                className="rounded-md border border-error/40 px-4 py-2 text-error"
                onClick={() => {
                  if (window.confirm('Remove this Sunday from local records?')) {
                    deleteSunday(draft.id, draft.enteredBy || 'Admin')
                    setSelectedId('new')
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div
            className={`rounded-xl border p-4 ${
              tone === 'balanced'
                ? 'border-balanced/40 bg-green-50'
                : tone === 'review'
                  ? 'border-review/40 bg-amber-50'
                  : 'border-error/40 bg-red-50'
            }`}
          >
            <h3 className="font-semibold text-navy-900">Totals</h3>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Income</dt>
                <dd>{fmtAmount(actual.income, settings.currencyLabel)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Actual spend</dt>
                <dd>{fmtAmount(actual.spend, settings.currencyLabel)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Remaining</dt>
                <dd>{fmtAmount(actual.balance, settings.currencyLabel)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Unexplained difference</dt>
                <dd>{fmtAmount(actual.unexplained, settings.currencyLabel)}</dd>
              </div>
            </dl>
            {unbalanced && (
              <p className="mt-3 text-sm text-review" role="alert">
                Income and spending do not currently balance. Please review the entries
                before finalising this report.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-navy-900/10 bg-white p-4">
            <h3 className="font-semibold text-navy-900">% by category (actual)</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(percents).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="text-muted">{k}</span>
                  <span>{v}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gold-500/40 bg-gold-100/50 p-4">
            <h3 className="font-semibold text-navy-900">Proposed model (for discussion)</h3>
            <p className="mt-1 text-xs text-muted">Band: {proposed.bandLabel || '—'}</p>
            {proposed.requiresReview ? (
              <p className="mt-2 text-sm text-review">{proposed.reviewMessage}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(proposedByCategory(proposed)).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span>{k}</span>
                    <span>{fmtAmount(v, settings.currencyLabel)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Ops shown separately when deducted:{' '}
              {fmtAmount(proposed.operatingExpenses, settings.currencyLabel)}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
