import { useEffect, useState } from 'react'
import { saveLogisticsData } from './api/logistics'
import { acceptTripOffer, fetchNotifications, markNotificationRead } from './api/notifications'
import TripOfferCard from './TripOfferCard'

let vehicleIdCounter = 1

function emptyVehicle() {
  vehicleIdCounter += 1
  return { id: `new-${Date.now()}-${vehicleIdCounter}`, type: '', capacity: '', registrationNumber: '', location: '', status: 'active', history: [], archived: false, archivedDate: '' }
}

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10)
}

const STATUS_KEYS = ['active', 'repair', 'transit', 'idle']
const STATUS_TONE = {
  active: 'bg-brand-100 text-brand-700',
  repair: 'bg-[var(--color-error-bg)] text-[var(--color-error-ink)]',
  transit: 'bg-[var(--color-info-bg)] text-[var(--color-info-ink)]',
  idle: 'bg-cream-200 text-[var(--text-muted)]',
}

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-400'

function StatusBadge({ status, t }) {
  const label = status === 'repair' ? t.statusRepair : status === 'transit' ? t.statusInTransit : status === 'idle' ? t.statusIdle : t.statusActive
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[status] || STATUS_TONE.active}`}>{label}</span>
}

function VehicleUpdateBox({ vehicle, t, onSave }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ status: vehicle.status || 'active', date: todayISO(), note: '' })
  if (!open) {
    return <button type="button" className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => setOpen(true)}>+ {t.addStatusUpdate}</button>
  }
  function submit(event) {
    event.preventDefault()
    if (!form.date) return
    onSave({ status: form.status, date: form.date, note: form.note.trim() })
    setForm({ status: form.status, date: todayISO(), note: '' })
    setOpen(false)
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl bg-cream-100 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>{t.updateDate}
          <input className={inputClass} type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </label>
        <label className={labelClass}>{t.statusLabel}
          <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {STATUS_KEYS.map((key) => (
              <option key={key} value={key}>{key === 'repair' ? t.statusRepair : key === 'transit' ? t.statusInTransit : key === 'idle' ? t.statusIdle : t.statusActive}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelClass}>{t.updateNotePlaceholder}
        <input className={inputClass} type="text" placeholder={t.updateNotePlaceholder} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </label>
      <div className="flex gap-2.5">
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{t.saveUpdate}</button>
        <button type="button" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-brand-800 hover:text-brand-600" onClick={() => setOpen(false)}>{t.back}</button>
      </div>
    </form>
  )
}

function JobOffers({ userId }) {
  const [notifications, setNotifications] = useState([])
  const [acceptStates, setAcceptStates] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let active = true
    fetchNotifications(userId)
      .then((rows) => { if (active) setNotifications(rows.filter((row) => row.type === 'trip_offer')) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

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
    if (!notification.is_read) {
      markNotificationRead(notification.id).catch(() => {})
      setNotifications((current) => current.map((row) => (row.id === notification.id ? { ...row, is_read: true } : row)))
    }
  }

  if (loading || notifications.length === 0) return null

  return (
    <section className="mb-8">
      <h3 className="mb-3.5 font-display text-xl font-bold text-brand-900">Job offers</h3>
      <div className="grid gap-4">
        {notifications.map((notification) => (
          <TripOfferCard
            key={notification.id}
            notification={notification}
            acceptState={acceptStates[notification.id]}
            onAccept={handleAccept}
          />
        ))}
      </div>
    </section>
  )
}

export default function TransportationDashboard({ userId, initialData, t, onComplete }) {
  const [tab, setTab] = useState('current')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(() => emptyVehicle())
  const [vehicles, setVehicles] = useState(() =>
    (initialData?.vehicles || []).map((vehicle) => ({ ...vehicle }))
  )
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const currentVehicles = vehicles.filter((vehicle) => !vehicle.archived)
  const pastVehicles = vehicles.filter((vehicle) => vehicle.archived)
  const inTransitCount = currentVehicles.filter((vehicle) => vehicle.status === 'transit').length

  async function doSave(nextVehicles) {
    setIsSaving(true)
    setSaveError('')
    try {
      const savedData = await saveLogisticsData(userId, {
        profile: initialData?.profile || null,
        vehicles: nextVehicles,
        inventory: initialData?.inventory || null,
        photo: initialData?.photo || null,
      })
      onComplete(savedData)
      setVehicles(savedData.vehicles || nextVehicles)
      return savedData
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  function updateForm(field, value) {
    const nextValue = field === 'registrationNumber' || field === 'location' ? value.toUpperCase() : value
    setForm((current) => ({ ...current, [field]: nextValue }))
  }

  async function handleAddSubmit(event) {
    event.preventDefault()
    const vehicle = {
      ...form,
      type: String(form.type || '').trim(),
      registrationNumber: String(form.registrationNumber || '').trim(),
      location: String(form.location || '').trim(),
    }
    if (!vehicle.type || !vehicle.registrationNumber) return
    const saved = await doSave([...vehicles, vehicle])
    if (saved) {
      setShowAddForm(false)
      setForm(emptyVehicle())
    }
  }

  async function addVehicleUpdate(vehicleId, update) {
    const next = vehicles.map((vehicle) => (vehicle.id === vehicleId
      ? { ...vehicle, status: update.status, history: [{ date: update.date, note: update.note }, ...(vehicle.history || [])] }
      : vehicle))
    await doSave(next)
  }

  async function moveToPast(vehicleId) {
    await doSave(vehicles.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, archived: true, archivedDate: todayISO() } : vehicle)))
  }

  async function restoreVehicle(vehicleId) {
    await doSave(vehicles.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, archived: false, archivedDate: '' } : vehicle)))
  }

  const list = tab === 'past' ? pastVehicles : currentVehicles
  const emptyText = tab === 'past' ? t.noPastTransportation : t.noVehiclesYet

  const stats = [
    ['Active vehicles', currentVehicles.length],
    ['In transit', inTransitCount],
    ['Archived', pastVehicles.length],
  ]

  return (
    <div>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</span>
              <strong className="mt-1 block font-display text-3xl font-bold text-brand-900">{value}</strong>
            </div>
          ))}
        </div>

        <JobOffers userId={userId} />

        <div className="mb-5 inline-flex rounded-xl bg-cream-100 p-1">
          <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'current' ? 'bg-white text-brand-900 shadow-sm' : 'text-[var(--text-muted)]'}`} onClick={() => setTab('current')}>{t.currentTransportLabel}</button>
          <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'past' ? 'bg-white text-brand-900 shadow-sm' : 'text-[var(--text-muted)]'}`} onClick={() => setTab('past')}>{t.pastTransportLabel}</button>
        </div>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">{emptyText}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((vehicle) => {
              const isPast = tab === 'past'
              return (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" key={vehicle.id}>
                  <div className="mb-3.5 flex items-center justify-between gap-2">
                    <strong className="text-base text-brand-900">{vehicle.type || t.vehicleWord}</strong>
                    {isPast ? (
                      <span className="inline-flex rounded-full bg-cream-200 px-2.5 py-1 text-xs font-bold text-[var(--text-muted)]">{t.statusSold}</span>
                    ) : (
                      <StatusBadge status={vehicle.status} t={t} />
                    )}
                  </div>
                  <div className="mb-3.5 grid gap-2.5">
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.regNumber}</span><strong className="text-brand-900">{vehicle.registrationNumber || '—'}</strong></div>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.capacityLabel}</span>
                      <strong className="text-brand-900">{vehicle.capacity != null && vehicle.capacity !== '' ? `${vehicle.capacity} kg` : '—'}</strong>
                    </div>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.vehicleLocation}</span><strong className="text-brand-900">{vehicle.location || '—'}</strong></div>
                  </div>

                  {isPast ? (
                    vehicle.archivedDate && (
                      <p className="text-sm text-[var(--text-muted)]">{t.archivedOn.replace('{date}', vehicle.archivedDate)}</p>
                    )
                  ) : (
                    <>
                      <div className="mb-3.5 border-t border-[var(--border-subtle)] pt-3.5">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-400">{t.historyLabel}</p>
                        {(vehicle.history || []).length === 0 ? (
                          <p className="text-sm text-[var(--text-muted)]">{t.noHistoryYet}</p>
                        ) : (
                          <div className="grid gap-1.5">
                            {(vehicle.history || []).map((entry, entryIndex) => (
                              <div className="flex gap-2.5 text-sm" key={`${vehicle.id}-${entryIndex}`}>
                                <span className="shrink-0 font-semibold text-brand-700">{entry.date || '—'}</span>
                                <span className="text-[var(--text-muted)]">{entry.note || ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <VehicleUpdateBox vehicle={vehicle} t={t} onSave={(update) => addVehicleUpdate(vehicle.id, update)} />
                    </>
                  )}

                  <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3.5">
                    {isPast ? (
                      <button type="button" className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => restoreVehicle(vehicle.id)} disabled={isSaving}>{t.restoreVehicle}</button>
                    ) : (
                      <button type="button" className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => moveToPast(vehicle.id)} disabled={isSaving}>{t.moveVehicleToPast}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAddSubmit} className="mt-6 grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
            <h3 className="font-display text-lg font-bold text-brand-900">{t.addVehicleTitle}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>{t.vehicleType}
                <select className={inputClass} value={form.type} onChange={(event) => updateForm('type', event.target.value)} required>
                  <option value="">{t.vehicleTypePlaceholder}</option>
                  {t.vehicleTypeSuggestions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>{t.vehicleRegistration}
                <input className={inputClass} type="text" placeholder={t.vehicleRegPlaceholder} value={form.registrationNumber} onChange={(event) => updateForm('registrationNumber', event.target.value)} required />
              </label>
              <label className={labelClass}>{t.vehicleCapacity}
                <input className={inputClass} type="number" step="0.01" min="0" placeholder={t.vehicleCapacityPlaceholder} value={form.capacity} onChange={(event) => updateForm('capacity', event.target.value)} />
              </label>
              <label className={labelClass}>{t.vehicleLocation}
                <input className={inputClass} type="text" placeholder={t.vehicleLocationPlaceholder} value={form.location} onChange={(event) => updateForm('location', event.target.value)} />
              </label>
              <label className={labelClass}>{t.statusLabel}
                <select className={inputClass} value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                  {STATUS_KEYS.map((key) => (
                    <option key={key} value={key}>{key === 'repair' ? t.statusRepair : key === 'transit' ? t.statusInTransit : key === 'idle' ? t.statusIdle : t.statusActive}</option>
                  ))}
                </select>
              </label>
            </div>
            {saveError && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{saveError}</p>}
            <div className="flex gap-2.5">
              <button type="button" className="rounded-lg px-4 py-3 text-sm font-semibold text-brand-800 hover:text-brand-600" onClick={() => { setShowAddForm(false); setSaveError('') }}>{t.back}</button>
              <button type="submit" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" disabled={isSaving}>{isSaving ? t.savingButton : t.addVehicleButton}</button>
            </div>
          </form>
        )}

        {!showAddForm && (
          <div className="mt-6">
            <button type="button" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => setShowAddForm(true)}>{t.addVehicleButton}</button>
          </div>
        )}
    </div>
  )
}
