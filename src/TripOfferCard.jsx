function formatRupees(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'
}

const COST_ROWS = [
  ['fuel_cost', 'Fuel'],
  ['driver_cost', 'Driver'],
  ['toll_cost', 'Toll'],
  ['maintenance_cost', 'Maintenance'],
  ['depreciation_cost', 'Depreciation'],
  ['loading_unloading_cost', 'Loading / unloading'],
  ['insurance_cost', 'Insurance'],
  ['permit_cost', 'Permits'],
]

export function tripRoute(payload) {
  return [payload.pickup, ...(Array.isArray(payload.stops) ? payload.stops.slice(1, -1) : []), payload.destination].filter(Boolean)
}

export default function TripOfferCard({ notification, acceptState, onAccept }) {
  const payload = notification.payload || {}
  const cost = payload.cost_breakdown || {}
  const route = tripRoute(payload)
  const state = acceptState || 'idle'

  const details = [
    ['Commodity', `${payload.commodity || '—'}${payload.shipment_weight_kg ? ` · ${payload.shipment_weight_kg}kg` : ''}`],
    ['Route', route.length ? route.join(' → ') : '—'],
    ['Distance', `${payload.distance_km ? `${payload.distance_km}km` : '—'}${payload.estimated_travel_time ? ` · ${payload.estimated_travel_time}` : ''}`],
    ['Vehicle needed', payload.vehicle_label || '—'],
  ]

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="border-b border-dashed border-[var(--border-subtle)] px-6 py-4">
        <p className="text-sm font-bold text-brand-900">{notification.title}</p>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{notification.body}</p>
      </div>

      <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</span>
            <strong className="text-sm text-brand-900">{value}</strong>
          </div>
        ))}
      </div>

      <div className="px-6 pb-5">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-brand-400">Cost breakdown</p>
        <div className="grid gap-2 rounded-xl bg-cream-100 p-4">
          {COST_ROWS.map(([key, label]) => (
            cost[key] != null && (
              <div key={key} className="flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
                <span>{label}</span>
                <span className="tabular-nums text-brand-900">{formatRupees(cost[key])}</span>
              </div>
            )
          ))}
          <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-2 text-sm font-semibold text-brand-900">
            <span>Total operating cost</span>
            <span className="tabular-nums">{formatRupees(cost.total_operating_cost)}</span>
          </div>
          <div className="flex items-baseline justify-between text-base font-bold text-brand-700">
            <span>Your payout</span>
            <span className="tabular-nums">{formatRupees(cost.driver_payout ?? payload.quoted_payout)}</span>
          </div>
        </div>
      </div>

      {payload.order_trip_id != null && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-cream-100 px-6 py-4">
          {state === 'accepted' && <span className="text-sm font-bold text-brand-700">✓ You accepted this job</span>}
          {state === 'taken' && <span className="text-sm font-semibold text-[var(--color-error-ink)]">Already accepted by another provider</span>}
          {state === 'error' && <span className="text-sm font-semibold text-[var(--color-error-ink)]">Couldn't accept — try again</span>}
          {(state === 'idle' || state === 'accepting' || state === 'error') && (
            <button
              type="button"
              className="ml-auto rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
              disabled={state === 'accepting'}
              onClick={() => onAccept(notification)}
            >
              {state === 'accepting' ? 'Accepting…' : 'Accept job'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}
