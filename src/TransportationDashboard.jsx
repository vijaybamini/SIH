import { useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

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
const STATUS_CLASS = { active: 'status-active', repair: 'status-repair', transit: 'status-transit', idle: 'status-idle' }

function StatusBadge({ status, t }) {
  const label = status === 'repair' ? t.statusRepair : status === 'transit' ? t.statusInTransit : status === 'idle' ? t.statusIdle : t.statusActive
  return <span className={`status-badge ${STATUS_CLASS[status] || 'status-active'}`}>{label}</span>
}

function VehicleUpdateBox({ vehicle, t, onSave }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ status: vehicle.status || 'active', date: todayISO(), note: '' })
  if (!open) {
    return <button type="button" className="button button-quiet update-toggle" onClick={() => setOpen(true)}>+ {t.addStatusUpdate}</button>
  }
  function submit(event) {
    event.preventDefault()
    if (!form.date) return
    onSave({ status: form.status, date: form.date, note: form.note.trim() })
    setForm({ status: form.status, date: todayISO(), note: '' })
    setOpen(false)
  }
  return (
    <form className="vehicle-update-row" onSubmit={submit}>
      <label>{t.updateDate}<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
      <label>{t.statusLabel}
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          {STATUS_KEYS.map((key) => (
            <option key={key} value={key}>{key === 'repair' ? t.statusRepair : key === 'transit' ? t.statusInTransit : key === 'idle' ? t.statusIdle : t.statusActive}</option>
          ))}
        </select>
      </label>
      <div className="update-note">
        <input type="text" placeholder={t.updateNotePlaceholder} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </div>
      <div className="update-actions">
        <button type="submit" className="button button-primary">{t.saveUpdate}</button>
        <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>{t.back}</button>
      </div>
    </form>
  )
}

export default function TransportationDashboard({ userId, initialData, language, setLanguage, onBack, onComplete }) {
  const t = useTranslation(language)
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

  return (
    <div className="profile-page">
      <div className="profile-page-inner" style={{ maxWidth: 900 }}>
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <div className="manage-head">
          <div>
            <p className="eyebrow" style={{ marginBottom: 6 }}>{t.stepTransportation}</p>
            <h2>{t.transportCard}</h2>
          </div>
        </div>

        <div className="manage-tabs-row">
          <div className="manage-tabs" role="tablist">
            <button type="button" className={`manage-tab ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>{t.currentTransportLabel}</button>
            <button type="button" className={`manage-tab ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>{t.pastTransportLabel}</button>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="manage-empty">{emptyText}</p>
        ) : (
          <div className="manage-grid">
            {list.map((vehicle) => {
              const isPast = tab === 'past'
              return (
                <div className="manage-card" key={vehicle.id}>
                  <div className="manage-card-head">
                    <strong>{vehicle.type || t.vehicleWord}</strong>
                    {isPast ? (
                      <span className="status-badge status-archived">{t.statusSold}</span>
                    ) : (
                      <StatusBadge status={vehicle.status} t={t} />
                    )}
                  </div>
                  <div className="manage-fields">
                    <div className="manage-field"><span>{t.regNumber}</span><strong>{vehicle.registrationNumber || '—'}</strong></div>
                    <div className="manage-field"><span>{t.capacityLabel}</span>
                      <strong>{vehicle.capacity != null && vehicle.capacity !== '' ? `${vehicle.capacity} kg` : '—'}</strong>
                    </div>
                    <div className="manage-field"><span>{t.vehicleLocation}</span><strong>{vehicle.location || '—'}</strong></div>
                  </div>

                  {isPast ? (
                    vehicle.archivedDate && (
                      <p className="manage-empty" style={{ padding: '10px 0 0' }}>{t.archivedOn.replace('{date}', vehicle.archivedDate)}</p>
                    )
                  ) : (
                    <>
                      <div className="vehicle-history">
                        <p className="vehicle-history-title">{t.historyLabel}</p>
                        {(vehicle.history || []).length === 0 ? (
                          <p className="panel-subtitle">{t.noHistoryYet}</p>
                        ) : (
                          (vehicle.history || []).map((entry, entryIndex) => (
                            <div className="history-entry" key={`${vehicle.id}-${entryIndex}`}>
                              <span className="history-date">{entry.date || '—'}</span>
                              <span className="history-note">{entry.note || ''}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <VehicleUpdateBox vehicle={vehicle} t={t} onSave={(update) => addVehicleUpdate(vehicle.id, update)} />
                    </>
                  )}

                  <div className="manage-card-actions">
                    {isPast ? (
                      <button type="button" className="button button-quiet" onClick={() => restoreVehicle(vehicle.id)} disabled={isSaving}>{t.restoreVehicle}</button>
                    ) : (
                      <button type="button" className="button button-quiet" onClick={() => moveToPast(vehicle.id)} disabled={isSaving}>{t.moveVehicleToPast}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showAddForm && (
          <form className="profile-form-card manage-add-panel" onSubmit={handleAddSubmit}>
            <h3 className="manage-add-title">{t.addVehicleTitle}</h3>
            <div className="form-grid">
              <label>{t.vehicleType}
                <select value={form.type} onChange={(event) => updateForm('type', event.target.value)} required>
                  <option value="">{t.vehicleTypePlaceholder}</option>
                  {t.vehicleTypeSuggestions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>{t.vehicleRegistration}
                <input type="text" placeholder={t.vehicleRegPlaceholder} value={form.registrationNumber} onChange={(event) => updateForm('registrationNumber', event.target.value)} required />
              </label>
              <label>{t.vehicleCapacity}
                <input type="number" step="0.01" min="0" placeholder={t.vehicleCapacityPlaceholder} value={form.capacity} onChange={(event) => updateForm('capacity', event.target.value)} />
              </label>
              <label>{t.vehicleLocation}
                <input type="text" placeholder={t.vehicleLocationPlaceholder} value={form.location} onChange={(event) => updateForm('location', event.target.value)} />
              </label>
              <label>{t.statusLabel}
                <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                  {STATUS_KEYS.map((key) => (
                    <option key={key} value={key}>{key === 'repair' ? t.statusRepair : key === 'transit' ? t.statusInTransit : key === 'idle' ? t.statusIdle : t.statusActive}</option>
                  ))}
                </select>
              </label>
            </div>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <div className="manage-add-actions">
              <button type="button" className="button button-quiet" onClick={() => { setShowAddForm(false); setSaveError('') }}>{t.back}</button>
              <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.addVehicleButton}</button>
            </div>
          </form>
        )}

        {!showAddForm && (
          <div className="manage-foot">
            <button type="button" className="button button-primary" onClick={() => setShowAddForm(true)}>{t.addVehicleButton}</button>
          </div>
        )}
      </div>
    </div>
  )
}