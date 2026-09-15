import type { ReactNode } from 'react'
import { Disclaimer } from './Disclaimer'
import { useApp } from '../context/AppContext'

export type TabId =
  | 'dashboard'
  | 'entry'
  | 'comparison'
  | 'reports'
  | 'settings'
  | 'audit'

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home' },
  { id: 'entry', label: 'Sunday entry', short: 'Entry' },
  { id: 'comparison', label: 'Comparison', short: 'Compare' },
  { id: 'reports', label: 'Reports', short: 'Reports' },
  { id: 'settings', label: 'Settings', short: 'Settings' },
  { id: 'audit', label: 'Audit log', short: 'Audit' },
]

export function Layout({
  tab,
  onTab,
  children,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  children: ReactNode
}) {
  const { settings, isAdmin, setRole } = useApp()

  return (
    <div className="min-h-screen bg-canvas">
      <header className="no-print border-b border-navy-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold text-navy-900 md:text-2xl">
              {settings.churchName}
            </h1>
            <p className="text-sm text-muted">
              Church finance · proposed model · actual distribution · trial structure
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-navy-900 px-3 py-1 text-white">
              {isAdmin ? 'Admin' : 'Viewer'}
            </span>
            <button
              type="button"
              className="rounded border border-navy-700/30 px-3 py-1 text-navy-800 hover:bg-navy-900/5"
              onClick={() => {
                if (isAdmin) {
                  setRole('Viewer')
                } else {
                  const pw = settings.adminPassword
                    ? window.prompt('Admin password (optional light gate)') || ''
                    : undefined
                  const res = setRole('Admin', pw)
                  if (!res.ok) window.alert(res.message)
                }
              }}
            >
              Switch to {isAdmin ? 'Viewer' : 'Admin'}
            </button>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pb-3 sm:flex-nowrap sm:overflow-x-auto"
          aria-label="Main"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`min-h-10 flex-1 rounded-md px-2 py-2 text-xs font-medium sm:flex-none sm:whitespace-nowrap sm:px-3 sm:text-sm ${
                tab === t.id
                  ? 'bg-navy-900 text-white'
                  : 'text-navy-800 hover:bg-navy-900/5'
              }`}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <div className="no-print">
          <Disclaimer />
        </div>
        {children}
      </div>

      <footer className="no-print mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted">
        Amounts shown in {settings.currencyLabel}. Final approval belongs to the elders
        and admins collectively.
      </footer>
    </div>
  )
}
