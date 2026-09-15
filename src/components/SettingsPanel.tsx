import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import type { CategoryConfig, ModelBand } from '../lib/types'
import { downloadText, exportJson, sundaysToCsv } from '../lib/storage'
import { DEFAULT_BANDS, DEFAULT_CATEGORIES } from '../lib/defaults'

export function SettingsPanel() {
  const { settings, state, updateSettings, isAdmin, resetSampleData, importBackup } =
    useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-review/40 bg-amber-50 p-4 text-sm">
        Settings can be changed in Admin role. Switch role from the header.
      </div>
    )
  }

  const setCats = (categories: CategoryConfig[]) => updateSettings({ categories })
  const setBands = (modelBands: ModelBand[]) => updateSettings({ modelBands })

  return (
    <div className="space-y-4" data-testid="settings">
      {msg ? (
        <p className="rounded border border-balanced/30 bg-green-50 px-3 py-2 text-sm">{msg}</p>
      ) : null}

      <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900">Church & currency</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Church name</span>
            <input
              className="w-full rounded border border-navy-900/20 px-2 py-1"
              value={settings.churchName}
              onChange={(e) => updateSettings({ churchName: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Currency label</span>
            <input
              className="w-full rounded border border-navy-900/20 px-2 py-1"
              value={settings.currencyLabel}
              onChange={(e) => updateSettings({ currencyLabel: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.noDebtMode}
              onChange={(e) => updateSettings({ noDebtMode: e.target.checked })}
            />
            No-debt mode (trial structure — debt slice redistributed per band rules)
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.deductOperatingExpenses}
              onChange={(e) => updateSettings({ deductOperatingExpenses: e.target.checked })}
            />
            Deduct operating expenses before applying the model
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Operating subcategories (comma-separated)</span>
            <input
              className="w-full rounded border border-navy-900/20 px-2 py-1"
              value={settings.operatingSubcategories.join(', ')}
              onChange={(e) =>
                updateSettings({
                  operatingSubcategories: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Optional admin password</span>
            <input
              type="password"
              className="w-full rounded border border-navy-900/20 px-2 py-1"
              value={settings.adminPassword}
              onChange={(e) => updateSettings({ adminPassword: e.target.value })}
              placeholder="Leave blank for open toggle"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900">Trial window</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              ['trialStart', 'Trial start'],
              ['trialEnd', 'Trial end'],
              ['trialReviewDate', 'Review date'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-muted">{label}</span>
              <input
                type="date"
                className="w-full rounded border border-navy-900/20 px-2 py-1"
                value={settings[key]}
                onChange={(e) => updateSettings({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-navy-900">Categories</h2>
          <button type="button" className="text-sm underline" onClick={() => setCats(DEFAULT_CATEGORIES)}>
            Reset defaults
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {settings.categories.map((cat, idx) => (
            <div key={cat.id} className="rounded border border-navy-900/10 p-3">
              <div className="font-medium text-navy-900">{cat.label}</div>
              <label className="mt-2 block text-sm">
                <span className="mb-1 block text-muted">Subcategories (comma-separated)</span>
                <input
                  className="w-full rounded border border-navy-900/20 px-2 py-1"
                  value={cat.subcategories.join(', ')}
                  onChange={(e) => {
                    const next = [...settings.categories]
                    next[idx] = {
                      ...cat,
                      subcategories: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
                    setCats(next)
                  }}
                />
              </label>
            </div>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">Dormant ministries (200–300 band)</span>
          <input
            className="w-full rounded border border-navy-900/20 px-2 py-1"
            value={settings.dormantMinistries.join(', ')}
            onChange={(e) =>
              updateSettings({
                dormantMinistries: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </section>

      <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-navy-900">Model band config</h2>
          <button type="button" className="text-sm underline" onClick={() => setBands(DEFAULT_BANDS)}>
            Reset band defaults
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Editable trial structure. Amounts in {settings.currencyLabel}.</p>
        <div className="mt-3 space-y-3">
          {settings.modelBands.map((band, idx) => (
            <div key={band.id} className="grid gap-2 rounded border border-navy-900/10 p-3 sm:grid-cols-4">
              <label className="text-xs sm:col-span-2">
                Label
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.label}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = { ...band, label: e.target.value }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Min G
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.minG}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = { ...band, minG: Number(e.target.value) }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Max G (blank = infinity)
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.maxG ?? ''}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = {
                      ...band,
                      maxG: e.target.value === '' ? null : Number(e.target.value),
                    }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Pastor fixed
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.pastorFixed ?? ''}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = {
                      ...band,
                      pastorFixed: e.target.value === '' ? null : Number(e.target.value),
                    }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Inst fixed
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.instFixed ?? ''}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = {
                      ...band,
                      instFixed: e.target.value === '' ? null : Number(e.target.value),
                    }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Rest Debt fraction
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.restDebt}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = { ...band, restDebt: Number(e.target.value) }
                    setBands(next)
                  }}
                />
              </label>
              <label className="text-xs">
                Requires review
                <select
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={band.requiresReview ? 'yes' : 'no'}
                  onChange={(e) => {
                    const next = [...settings.modelBands]
                    next[idx] = { ...band, requiresReview: e.target.value === 'yes' }
                    setBands(next)
                  }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900">Data</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-navy-900 px-3 py-2 text-sm text-white"
            onClick={() => {
              downloadText('namasuba-finance-backup.json', exportJson(state), 'application/json')
              setMsg('JSON exported.')
            }}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="rounded border border-navy-900/20 px-3 py-2 text-sm"
            onClick={() => {
              downloadText('namasuba-finance.csv', sundaysToCsv(state), 'text/csv')
              setMsg('CSV exported.')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded border border-navy-900/20 px-3 py-2 text-sm"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                importBackup(await file.text())
                setMsg('Backup imported.')
              } catch {
                setMsg('Import failed — check file format.')
              }
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="rounded border border-review/40 px-3 py-2 text-sm text-review"
            onClick={() => {
              if (window.confirm('Reload sample Sundays (6 & 13 Sep) and default settings?')) {
                resetSampleData()
                setMsg('Sample data reloaded.')
              }
            }}
          >
            Reload sample data
          </button>
        </div>
      </section>
    </div>
  )
}
