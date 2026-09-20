import { useEffect, useRef, useState } from 'react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from './api/notifications'

function timeAgo(isoString) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function NotificationBell({ userId, onViewTripOffer }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [expandedId, setExpandedId] = useState(null)
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

  async function markRead(item) {
    if (item.is_read) return
    setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
    try { await markNotificationRead(item.id) } catch { /* best-effort */ }
  }

  async function handleItemClick(item) {
    if (item.type === 'trip_offer') {
      await markRead(item)
      setOpen(false)
      onViewTripOffer?.(item)
      return
    }
    setExpandedId((current) => (current === item.id ? null : item.id))
    await markRead(item)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-lg transition-colors hover:bg-brand-50"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[340px] max-w-[90vw] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-lg shadow-brand-900/10">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <p className="text-sm font-bold text-brand-900">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No job offers yet — they'll show up here as soon as an order needs your vehicle.</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {notifications.map((item) => (
                <li key={item.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <button
                    type="button"
                    className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-cream-100 ${item.is_read ? '' : 'bg-brand-50/60'}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="text-sm font-bold text-brand-900">{item.title}</span>
                    <span className="text-[13px] text-[var(--text-secondary)]">{item.body}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{timeAgo(item.created_at)}</span>
                    {item.type === 'trip_offer' && (
                      <span className="mt-1 text-xs font-semibold text-brand-600">View full offer →</span>
                    )}
                  </button>
                  {expandedId === item.id && item.type !== 'trip_offer' && (
                    <div className="px-4 pb-3 text-sm text-[var(--text-muted)]">{item.body}</div>
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
