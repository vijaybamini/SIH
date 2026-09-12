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

export default function NotificationBell({ userId }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
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

  function handleOpen() {
    setOpen((current) => !current)
  }

  async function handleMarkAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
    try { await markAllNotificationsRead(userId) } catch { /* best-effort */ }
  }

  async function handleItemClick(item) {
    if (item.is_read) return
    setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
    try { await markNotificationRead(item.id) } catch { /* best-effort */ }
  }

  return (
    <div ref={wrapRef} className="utility-menu notification-bell-wrap">
      <button
        className="utility-button notification-bell-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={handleOpen}
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
