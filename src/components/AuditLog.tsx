import { useApp } from '../context/AppContext'

export function AuditLog() {
  const { state } = useApp()
  return (
    <div className="rounded-xl border border-navy-900/10 bg-white shadow-sm" data-testid="audit">
      <div className="border-b border-navy-900/10 bg-navy-900 px-4 py-3 text-white">
        <h2 className="font-semibold">Audit log</h2>
        <p className="text-xs text-white/80">Local edit history for transparency</p>
      </div>
      <ul className="divide-y divide-navy-900/10">
        {state.auditLog.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted">No entries yet.</li>
        ) : (
          state.auditLog.map((e) => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <div className="font-medium text-navy-900">
                {e.action} · {e.actor}
              </div>
              <div className="text-muted">{e.detail}</div>
              <div className="text-xs text-muted">
                {new Date(e.at).toLocaleString()}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
