import { useEffect, useRef, useState } from 'react'
import { acceptTripOffer, fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from './api/notifications'

function timeAgo(isoString) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

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

function TripOfferDetail({ notification, acceptState, onAccept }) {
  const payload = notification.payload || {}
  const cost = payload.cost_breakdown || {}
  const route = [payload.pickup, ...(Array.isArray(payload.stops) ? payload.stops.slice(1, -1) : []), payload.destination].filter(Boolean)
  const state = acceptState || 'idle'

  return (
    <div className="notification-detail">
      <div className="notification-detail-row">
        <span>Commodity</span><strong>{payload.commodity || '—'} · {payload.shipment_weight_kg ? `${payload.shipment_weight_kg}kg` : '—'}</strong>
      </div>
      <div className="notification-detail-row">
        <span>Route</span><strong>{route.length ? route.join(' → ') : '—'}</strong>
      </div>
      <div className="notification-detail-row">
        <span>Distance</span><strong>{payload.distance_km ? `${payload.distance_km}km` : '—'}{payload.estimated_travel_time ? ` · ${payload.estimated_travel_time}` : ''}</strong>
      </div>
      <div className="notification-detail-row">
        <span>Vehicle needed</span><strong>{payload.vehicle_label || '—'}</strong>
      </div>

      <p className="notification-detail-subhead">Cost breakdown</p>
      <table className="notification-cost-table">
        <tbody>
          {COST_ROWS.map(([key, label]) => (
            cost[key] != null && (
              <tr key={key}><td>{label}</td><td>{formatRupees(cost[key])}</td></tr>
            )
          ))}
          <tr className="notification-cost-total"><td>Total operating cost</td><td>{formatRupees(cost.total_operating_cost)}</td></tr>
          <tr className="notification-cost-payout"><td>Your payout</td><td>{formatRupees(cost.driver_payout ?? payload.quoted_payout)}</td></tr>
        </tbody>
      </table>

      {payload.order_trip_id != null && (
        <div className="notification-accept-row">
          {state === 'accepted' && <span className="notification-status notification-status-accepted">✓ You accepted this job</span>}
          {state === 'taken' && <span className="notification-status notification-status-taken">Already accepted by another provider</span>}
          {state === 'error' && <span className="notification-status notification-status-taken">Couldn't accept — try again</span>}
          {(state === 'idle' || state === 'accepting' || state === 'error') && (
            <button
              type="button"
              className="button button-primary notification-accept-button"
              disabled={state === 'accepting'}
              onClick={() => onAccept(notification)}
            >
              {state === 'accepting' ? 'Accepting…' : 'Accept job'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function NotificationBell({ userId }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [acceptStates, setAcceptStates] = useState({})
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    fetchNotifications(userId)
      .then((rows) => { if (active) setNotifications(rows) })
      .catch(() => {})

    const unsubscribe = subscribeToNotifications(userId, (row) => {
      setNotifications((current) => [row, ...current])
    })
    return () => { active = false; unsubscribe() }
  }, [userId])

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const unreadCount = notifications.filter((item) => !item.is_read).length

  async function handleMarkAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
    try { await markAllNotificationsRead(userId) } catch { /* best-effort */ }
  }

  async function handleItemClick(item) {
    setExpandedId((current) => (current === item.id ? null : item.id))
    if (item.is_read) return
    setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
    try { await markNotificationRead(item.id) } catch { /* best-effort */ }
  }

  async function handleAccept(notification) {
    const tripId = notification.payload?.order_trip_id
    if (tripId == null) return
    setAcceptStates((current) => ({ ...current, [notification.id]: 'accepting' }))
    try {
      const result = await acceptTripOffer(tripId, userId)
      setAcceptStates((current) => ({ ...current, [notification.id]: result?.success ? 'accepted' : 'taken' }))
    } catch {
      setAcceptStates((current) => ({ ...current, [notification.id]: 'error' }))
    }
  }

  return (
    <div ref={wrapRef} className="utility-menu notification-bell-wrap">
      <button
        className="utility-button notification-bell-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="utility-popover notification-popover">
          <div className="notification-popover-head">
            <p className="popover-title">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-all" onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="notification-empty">No job offers yet — they'll show up here as soon as an order needs your vehicle.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item ${item.is_read ? '' : 'unread'}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="notification-item-title">{item.title}</span>
                    <span className="notification-item-body">{item.body}</span>
                    <span className="notification-item-time">{timeAgo(item.created_at)}</span>
                  </button>
                  {expandedId === item.id && item.type === 'trip_offer' && (
                    <TripOfferDetail
                      notification={item}
                      acceptState={acceptStates[item.id]}
                      onAccept={handleAccept}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
