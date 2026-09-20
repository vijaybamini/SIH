import { useEffect, useState } from 'react'
import { fetchMyTrips, markTripDelivered } from './api/logisticsJobs'

function formatRupees(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'
}

const STATUS_LABEL = {
  accepted: 'Accepted — pickup pending',
  delivered: 'Delivered',
}

const STATUS_TONE = {
  accepted: 'bg-[var(--color-info-bg)] text-[var(--color-info-ink)]',
  delivered: 'bg-brand-100 text-brand-700',
}

export default function MyJobsPanel({ userId }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [deliveringId, setDeliveringId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    fetchMyTrips(userId)
      .then((rows) => { if (active) setTrips(rows) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

  async function handleMarkDelivered(trip) {
    setDeliveringId(trip.id)
    try {
      const result = await markTripDelivered(trip.id, userId)
      if (result?.success) {
        setTrips((current) => current.map((t) => (t.id === trip.id ? { ...t, assignment_status: 'delivered', delivered_at: new Date().toISOString() } : t)))
      }
    } catch {
      /* leave the row as-is; the button re-enables so they can retry */
    } finally {
      setDeliveringId(null)
    }
  }

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Loading your jobs…</p>
  if (error) return <p className="text-sm text-[var(--text-muted)]">Couldn't load your jobs: {error}</p>

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
        <p className="text-sm text-[var(--text-muted)]">No accepted jobs yet. Accept a job from the notification bell above to see it here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {trips.map((trip) => {
        const stops = Array.isArray(trip.stops) ? trip.stops : []
        return (
          <div key={trip.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-brand-900">Order #{trip.order_id}</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[trip.assignment_status] || STATUS_TONE.accepted}`}>{STATUS_LABEL[trip.assignment_status] || trip.assignment_status}</span>
            </div>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">Weight</span><strong className="text-brand-900">{trip.total_weight_kg ? `${trip.total_weight_kg}kg` : '—'}</strong></div>
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">Distance</span><strong className="text-brand-900">{trip.distance_km ? `${trip.distance_km}km` : '—'}</strong></div>
              {stops.length > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-sm"><span className="shrink-0 text-[var(--text-muted)]">Route</span><strong className="text-right text-brand-900">{stops.join(' → ')}</strong></div>
              )}
              <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-2 text-base font-bold text-brand-700">
                <span>Payout</span><span>{formatRupees(trip.cost)}</span>
              </div>
            </div>
            {trip.assignment_status === 'accepted' && (
              <button
                type="button"
                className="mt-3.5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
                disabled={deliveringId === trip.id}
                onClick={() => handleMarkDelivered(trip)}
              >
                {deliveringId === trip.id ? 'Marking…' : 'Mark delivered'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
