import { useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  aggregateReports,
  computeActual,
  computeProposed,
  proposedByCategory,
} from '../lib/modelEngine'
import { DISCLAIMER } from '../lib/defaults'
import { fmtAmount, fmtDate } from '../lib/format'
import { buildPdfReport, downloadElementPng } from '../lib/exportReport'

const CATS = [
  'Pastor',
  'Instrumentalists',
  'Debt',
  'Ushering',
  'Savings',
  'Other ministries and operations',
]

export function ReportGenerator() {
  const { sundays, settings } = useApp()
  const previewRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState('')
  const sorted = useMemo(
    () => [...sundays].sort((a, b) => a.date.localeCompare(b.date)),
    [sundays],
  )
  const { actual, proposed, sundayCount } = useMemo(
    () => aggregateReports(sorted, settings),
    [sorted, settings],
  )
  const propCats = proposedByCategory(proposed)

  return (
    <div className="space-y-4" data-testid="reports">
      <div className="no-print flex flex-wrap gap-2 rounded-xl border border-navy-900/10 bg-white p-4">
        <button
          type="button"
          className="rounded bg-navy-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={!!busy}
          onClick={() => {
            setBusy('pdf')
            try {
              buildPdfReport(sorted, settings)
            } finally {
              setBusy('')
            }
          }}
        >
          {busy === 'pdf' ? 'Preparing…' : 'Download PDF (A4)'}
        </button>
        <button
          type="button"
          className="rounded border border-navy-900/20 px-3 py-2 text-sm disabled:opacity-50"
          disabled={!!busy}
          onClick={async () => {
            if (!previewRef.current) return
            setBusy('png')
            try {
              await downloadElementPng(
                previewRef.current,
                `${settings.churchName.replace(/\s+/g, '-')}-finance-draft.png`,
              )
            } finally {
              setBusy('')
            }
          }}
        >
          {busy === 'png' ? 'Capturing…' : 'Download PNG (high-res)'}
        </button>
        <button
          type="button"
          className="rounded border border-navy-900/20 px-3 py-2 text-sm"
          onClick={() => window.print()}
        >
          Print preview
        </button>
      </div>

      <div
        ref={previewRef}
        className="rounded-xl border border-navy-900/10 bg-white p-6 shadow-sm"
        style={{ background: '#ffffff' }}
      >
        <header className="border-b border-gold-500/50 pb-4">
          <h1 className="text-2xl font-semibold text-navy-900">{settings.churchName}</h1>
          <h2 className="mt-1 text-lg text-navy-800">
            Sunday Finance Report — Draft for Discussion
          </h2>
          <p className="mt-1 text-sm text-gold-500">
            Proposed model · Actual distribution · Trial structure
          </p>
          <p className="mt-3 rounded bg-gold-100 px-3 py-2 text-xs text-navy-900">{DISCLAIMER}</p>
        </header>

        <section className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted">Sundays in report:</span> {sundayCount}
          </p>
          <p>
            <span className="text-muted">Currency:</span> {settings.currencyLabel}
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
            <span className="text-muted">Named gifts (excluded from model):</span>{' '}
            {fmtAmount(actual.namedGifts, settings.currencyLabel)}
          </p>
        </section>

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
                const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
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

        {sorted.map((s) => {
          const a = computeActual(s)
          const p = computeProposed(s, settings)
          const pc = proposedByCategory(p)
          return (
            <section key={s.id} className="mt-6 break-inside-avoid">
              <h3 className="text-base font-semibold text-navy-900">
                Sunday {fmtDate(s.date)} · {s.status}
              </h3>
              <p className="text-xs text-muted">
                Entered by {s.enteredBy || '—'} · Band {p.bandLabel || '—'}
              </p>
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
                    const diff = Math.round((act - prop + Number.EPSILON) * 100) / 100
                    return (
                      <tr key={c} className="border-b border-navy-900/10">
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
              {s.notes ? <p className="mt-2 text-xs text-muted">Notes: {s.notes}</p> : null}
            </section>
          )
        })}

        <section className="mt-8 border-t border-navy-900/10 pt-4">
          <h3 className="text-base font-semibold text-navy-900">
            Signatures (discussion / possible trial)
          </h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 text-sm">
            <p>Elder / Admin: ______________________ Date: __________</p>
            <p>Elder / Admin: ______________________ Date: __________</p>
            <p>Prepared by: ________________________ Date: __________</p>
          </div>
          <p className="mt-6 text-xs text-muted">{DISCLAIMER}</p>
        </section>
      </div>
    </div>
  )
}
