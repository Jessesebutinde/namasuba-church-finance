import { DISCLAIMER } from '../lib/defaults'

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-md border border-gold-500/40 bg-gold-100 text-navy-900 ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
      }`}
      role="note"
    >
      <span className="font-medium text-navy-800">Draft for discussion. </span>
      {DISCLAIMER}
    </div>
  )
}
