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

  if (loading) return <p className="panel-subtitle">Loading your jobs…</p>
  if (error) return <p className="panel-subtitle">Couldn't load your jobs: {error}</p>

  if (trips.length === 0) {
    return (
      <div className="myjobs-empty">
        <p className="panel-subtitle">No accepted jobs yet. Accept a job from the notification bell above to see it here.</p>
      </div>
    )
  }

  return (
    <div className="myjobs-list">
      {trips.map((trip) => {
        const stops = Array.isArray(trip.stops) ? trip.stops : []
        return (
          <div key={trip.id} className="myjobs-card">
            <div className="myjobs-card-head">
              <span className="myjobs-order">Order #{trip.order_id}</span>
              <span className={`myjobs-status myjobs-status-${trip.assignment_status}`}>{STATUS_LABEL[trip.assignment_status] || trip.assignment_status}</span>
            </div>
            <div className="myjobs-card-row">
              <span>Weight</span><strong>{trip.total_weight_kg ? `${trip.total_weight_kg}kg` : '—'}</strong>
            </div>
            <div className="myjobs-card-row">
              <span>Distance</span><strong>{trip.distance_km ? `${trip.distance_km}km` : '—'}</strong>
            </div>
            {stops.length > 0 && (
              <div className="myjobs-card-row">
                <span>Route</span><strong>{stops.join(' → ')}</strong>
              </div>
            )}
            <div className="myjobs-card-row myjobs-payout-row">
              <span>Payout</span><strong>{formatRupees(trip.cost)}</strong>
            </div>
            {trip.assignment_status === 'accepted' && (
              <button
                type="button"
                className="button button-primary myjobs-deliver-button"
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
