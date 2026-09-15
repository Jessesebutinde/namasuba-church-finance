import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppSettings, AppState, Role, SundayReport } from '../lib/types'
import {
  loadState,
  saveState,
  makeAudit,
  initialState,
  importJson,
} from '../lib/storage'

interface AppContextValue {
  state: AppState
  settings: AppSettings
  sundays: SundayReport[]
  isAdmin: boolean
  setRole: (role: Role, password?: string) => { ok: boolean; message: string }
  updateSettings: (patch: Partial<AppSettings>) => void
  saveSunday: (report: SundayReport, actor: string) => void
  deleteSunday: (id: string, actor: string) => void
  setSundayStatus: (id: string, status: SundayReport['status'], actor: string) => void
  resetSampleData: () => void
  replaceState: (next: AppState, detail: string) => void
  importBackup: (text: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    if (typeof localStorage === 'undefined') return initialState()
    return loadState()
  })

  useEffect(() => {
    saveState(state)
  }, [state])

  const isAdmin = state.settings.role === 'Admin'

  const setRole = useCallback(
    (role: Role, password?: string) => {
      if (role === 'Admin' && state.settings.adminPassword) {
        if (password !== state.settings.adminPassword) {
          return { ok: false, message: 'Password does not match.' }
        }
      }
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, role },
        auditLog: [
          makeAudit(prev.settings.role, 'role_change', `Switched to ${role}`),
          ...prev.auditLog,
        ].slice(0, 200),
      }))
      return { ok: true, message: `Role set to ${role}` }
    },
    [state.settings.adminPassword, state.settings.role],
  )

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
      auditLog: [
        makeAudit(
          prev.settings.role,
          'settings',
          `Updated settings: ${Object.keys(patch).join(', ')}`,
        ),
        ...prev.auditLog,
      ].slice(0, 200),
    }))
  }, [])

  const saveSunday = useCallback((report: SundayReport, actor: string) => {
    setState((prev) => {
      const exists = prev.sundays.some((s) => s.id === report.id)
      const sundays = exists
        ? prev.sundays.map((s) => (s.id === report.id ? report : s))
        : [...prev.sundays, report]
      return {
        ...prev,
        sundays,
        auditLog: [
          makeAudit(
            actor || prev.settings.role,
            exists ? 'update_sunday' : 'create_sunday',
            `${exists ? 'Updated' : 'Created'} Sunday ${report.date}`,
          ),
          ...prev.auditLog,
        ].slice(0, 200),
      }
    })
  }, [])

  const deleteSunday = useCallback((id: string, actor: string) => {
    setState((prev) => {
      const target = prev.sundays.find((s) => s.id === id)
      return {
        ...prev,
        sundays: prev.sundays.filter((s) => s.id !== id),
        auditLog: [
          makeAudit(actor, 'delete_sunday', `Deleted Sunday ${target?.date ?? id}`),
          ...prev.auditLog,
        ].slice(0, 200),
      }
    })
  }, [])

  const setSundayStatus = useCallback(
    (id: string, status: SundayReport['status'], actor: string) => {
      setState((prev) => ({
        ...prev,
        sundays: prev.sundays.map((s) =>
          s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s,
        ),
        auditLog: [
          makeAudit(actor, 'status', `Set ${id} to ${status}`),
          ...prev.auditLog,
        ].slice(0, 200),
      }))
    },
    [],
  )

  const resetSampleData = useCallback(() => {
    const next = initialState()
    setState(next)
  }, [])

  const replaceState = useCallback((next: AppState, detail: string) => {
    setState({
      ...next,
      auditLog: [makeAudit('Admin', 'replace_state', detail), ...next.auditLog].slice(
        0,
        200,
      ),
    })
  }, [])

  const importBackup = useCallback((text: string) => {
    const next = importJson(text)
    setState({
      ...next,
      auditLog: [
        makeAudit('Admin', 'import', 'Imported JSON backup'),
        ...next.auditLog,
      ].slice(0, 200),
    })
  }, [])

  const value = useMemo(
    () => ({
      state,
      settings: state.settings,
      sundays: state.sundays,
      isAdmin,
      setRole,
      updateSettings,
      saveSunday,
      deleteSunday,
      setSundayStatus,
      resetSampleData,
      replaceState,
      importBackup,
    }),
    [
      state,
      isAdmin,
      setRole,
      updateSettings,
      saveSunday,
      deleteSunday,
      setSundayStatus,
      resetSampleData,
      replaceState,
      importBackup,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
