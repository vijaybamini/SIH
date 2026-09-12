import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

let vehicleIdCounter = 1

function emptyVehicle() {
  vehicleIdCounter += 1
  return { id: `new-${Date.now()}-${vehicleIdCounter}`, type: '', capacity: '', registrationNumber: '', location: '', status: 'active', history: [] }
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
  const [step, setStep] = useState(0)
  const [unlockedStep, setUnlockedStep] = useState(0)
  const formRef = useRef(null)
  const [mode, setMode] = useState(() => {
    const hasVehicle = (initialData?.vehicles || []).some((vehicle) => vehicle.type && vehicle.registrationNumber)
    return hasVehicle ? 'overview' : 'edit'
  })
  const [profile, setProfile] = useState({
    name: initialData?.profile?.name || '',
    aadhaarNumber: initialData?.profile?.aadhaarNumber || '',
    phone: initialData?.profile?.phone || '',
    address: initialData?.profile?.address || '',
    crops: initialData?.profile?.crops?.length ? initialData.profile.crops : [''],
  })
  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [photoFile, setPhotoFile] = useState(null)
  const [vehicles, setVehicles] = useState(() => {
    if (initialData?.vehicles?.length) return initialData.vehicles.map((vehicle) => ({ ...vehicle }))
    return [emptyVehicle()]
  })
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const steps = [t.basicDetails, t.vehiclesSection]

  function updateProfile(field, value) {
    if (field === 'aadhaarNumber') value = value.replace(/\D/g, '').slice(0, 12)
    if (field === 'phone') value = value.replace(/\D/g, '').slice(0, 10)
    setProfile((current) => ({ ...current, [field]: value }))
  }

  function updateCrop(index, value) {
    setProfile((current) => ({ ...current, crops: current.crops.map((crop, i) => (i === index ? value : crop)) }))
  }
  function addCrop() {
    setProfile((current) => ({ ...current, crops: [...current.crops, ''] }))
  }
  function removeCrop(index) {
    setProfile((current) => ({ ...current, crops: current.crops.filter((_, i) => i !== index) }))
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
  }

  function updateVehicle(id, field, value) {
    const nextValue = field === 'registrationNumber' || field === 'location' ? value.toUpperCase() : value
    setVehicles((current) => current.map((vehicle) => (vehicle.id === id ? { ...vehicle, [field]: nextValue } : vehicle)))
  }

  function addVehicle() {
    setVehicles((current) => [...current, emptyVehicle()])
  }

  function removeVehicle(id) {
    setVehicles((current) => current.filter((vehicle) => vehicle.id !== id))
  }

  function goNext() {
    if (formRef.current && !formRef.current.reportValidity()) return
    setUnlockedStep((current) => Math.max(current, step + 1))
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function goToStep(index) {
    if (index <= unlockedStep) setStep(index)
  }

  async function doSave(nextVehicles, nextProfile) {
    setIsSaving(true)
    setSaveError('')
    try {
      const savedData = await saveLogisticsData(userId, {
        profile: nextProfile || profile,
        vehicles: nextVehicles,
        inventory: initialData?.inventory || null,
        photo,
        photoFile,
      })
      onComplete(savedData)
      setPhoto(savedData.photo)
      setPhotoFile(null)
      return savedData
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (formRef.current && !formRef.current.reportValidity()) return
    const savedData = await doSave(vehicles, profile)
    if (savedData) setMode('overview')
  }

  function addVehicleUpdate(vehicleId, update) {
    const next = vehicles.map((vehicle) => (vehicle.id === vehicleId
      ? { ...vehicle, status: update.status, history: [{ date: update.date, note: update.note }, ...(vehicle.history || [])] }
      : vehicle))
    doSave(next)
  }

  const profileComplete = Boolean(profile.name && profile.aadhaarNumber && profile.phone && profile.address)
  const namedVehicles = vehicles.filter((vehicle) => vehicle.type)

  if (mode === 'edit') {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <div className="profile-page-topbar">
            <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <p className="eyebrow">{t.stepTransportation}</p>
          <h2>{t.transportDetailsTitle}</h2>
          <p className="panel-subtitle">{t.transportDetailsSub}</p>

          <div className="profile-steps">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`${index === step ? 'active' : index < step ? 'done' : ''} ${index > unlockedStep ? 'locked' : ''}`}
                aria-disabled={index > unlockedStep}
                onClick={() => goToStep(index)}
              >
                <span>{index + 1}</span>{label}
              </button>
            ))}
          </div>

          <form className="profile-form-card" onSubmit={handleSubmit} ref={formRef}>
            {step === 0 && (
              <>
                <div className="photo-upload-row">
                  <label className="photo-upload-circle">
                    {photo ? (
                      <img className="photo-preview" src={photo} alt="" />
                    ) : (
                      <div className="photo-preview photo-preview-empty" aria-hidden="true">
                        <span className="photo-upload-icon">📷</span>
                        <span className="photo-upload-caption">{t.uploadPhoto}</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handlePhotoChange} />
                  </label>
                  {photo && <label className="photo-change-link">{t.changePhoto}<input type="file" accept="image/*" onChange={handlePhotoChange} /></label>}
                </div>

                <div className="form-grid">
                  <label>{t.name}<input value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} placeholder={t.namePlaceholder} required /></label>
                  <label>{t.aadhaarNumber}<input inputMode="numeric" pattern="[0-9]{12}" value={profile.aadhaarNumber} onChange={(event) => updateProfile('aadhaarNumber', event.target.value)} placeholder={t.aadhaarPlaceholder} required /></label>
                  <label>{t.phone}<input type="tel" inputMode="numeric" pattern="[0-9]{10}" value={profile.phone} onChange={(event) => updateProfile('phone', event.target.value)} placeholder={t.phonePlaceholder} required /></label>
                  <label>{t.address}<textarea value={profile.address} onChange={(event) => updateProfile('address', event.target.value)} placeholder={t.addressPlaceholder} required /></label>
                </div>

                <h3 className="form-section-title">{t.cropsYouHandle}</h3>
                {profile.crops.map((crop, index) => (
                  <div className="crop-card-header" key={index}>
                    <label>{index === 0 ? t.cropWord : t.additionalCrop}
                      <select value={crop} onChange={(event) => updateCrop(index, event.target.value)}>
                        <option value="">{t.selectCrop}</option>
                        {t.cropSuggestions.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    {profile.crops.length > 1 && (
                      <button type="button" className="remove-crop-button" onClick={() => removeCrop(index)} aria-label={t.removeThisCropLabel}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" className="add-crop-button" onClick={addCrop}>
                  <span aria-hidden="true">+</span> {t.addAnotherCrop}
                </button>
              </>
            )}

            {step === 1 && (
              <div className="crop-section">
                {vehicles.map((vehicle, index) => (
                  <div className="crop-card" key={vehicle.id}>
                    <div className="crop-card-header">
                      <label>{`${t.vehicleWord} ${index + 1} — ${t.vehicleType}`}
                        <select value={vehicle.type} onChange={(event) => updateVehicle(vehicle.id, 'type', event.target.value)} required>
                          <option value="">{t.vehicleTypePlaceholder}</option>
                          {t.vehicleTypeSuggestions.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      {vehicles.length > 1 && (
                        <button type="button" className="remove-crop-button" onClick={() => removeVehicle(vehicle.id)} aria-label={t.removeVehicleLabel}>×</button>
                      )}
                    </div>

                    <div className="form-grid">
                      <label>{t.vehicleCapacity}
                        <input type="number" step="0.01" min="0" placeholder={t.vehicleCapacityPlaceholder} value={vehicle.capacity} onChange={(event) => updateVehicle(vehicle.id, 'capacity', event.target.value)} required />
                      </label>
                      <label>{t.vehicleRegistration}
                        <input type="text" placeholder={t.vehicleRegPlaceholder} value={vehicle.registrationNumber} onChange={(event) => updateVehicle(vehicle.id, 'registrationNumber', event.target.value)} required />
                      </label>
                      <label>{t.vehicleLocation}
                        <input type="text" placeholder={t.vehicleLocationPlaceholder} value={vehicle.location} onChange={(event) => updateVehicle(vehicle.id, 'location', event.target.value)} required />
                      </label>
                      <label>{t.statusLabel}
                        <select value={vehicle.status} onChange={(event) => updateVehicle(vehicle.id, 'status', event.target.value)}>
                          {STATUS_KEYS.map((key) => (
                            <option key={key} value={key}>{key === 'repair' ? t.statusRepair : key === 'transit' ? t.statusInTransit : key === 'idle' ? t.statusIdle : t.statusActive}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}

                <button type="button" className="add-crop-button" onClick={addVehicle}>
                  <span aria-hidden="true">+</span> {t.addAnotherVehicle}
                </button>
                <p className="vehicles-count">{t.vehiclesAdded.replace('{n}', namedVehicles.length)}</p>
              </div>
            )}

            <div className="profile-actions">
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              {step > 0 && <button type="button" className="button button-quiet" onClick={() => setStep(step - 1)}>{t.back}</button>}
              {step < steps.length - 1
                ? <button type="button" className="button button-primary" onClick={goNext}>{t.next}</button>
                : <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>}
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <div className="profile-summary-header">
          {photo ? (
            <img className="profile-summary-photo" src={photo} alt="" />
          ) : (
            <div className="profile-summary-photo profile-summary-photo-empty" aria-hidden="true">{profile.name ? profile.name[0] : 'T'}</div>
          )}
          <div className="profile-summary-header-text">
            <p className="eyebrow">{t.stepTransportation}</p>
            <h2>{t.transportDetailsTitle}</h2>
          </div>
          <button className="button button-primary" onClick={() => setMode('edit')}>{t.editProfile}</button>
        </div>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <div className="summary-section">
          <h3>{t.basicDetails}</h3>
          {!profileComplete ? (
            <p className="panel-subtitle">{t.completeProfile}</p>
          ) : (
            <div className="summary-grid">
              <div><span>{t.name}</span><strong>{profile.name || '—'}</strong></div>
              <div><span>{t.aadhaarNumber}</span><strong>{profile.aadhaarNumber || '—'}</strong></div>
              <div><span>{t.phone}</span><strong>{profile.phone || '—'}</strong></div>
              <div><span>{t.address}</span><strong>{profile.address || '—'}</strong></div>
              <div><span>{t.cropsLabel}</span><strong>{profile.crops.filter(Boolean).join(', ') || '—'}</strong></div>
            </div>
          )}
        </div>

        <h3 className="dash-section-title">{t.vehicleStatusTitle}</h3>
        {namedVehicles.length === 0 ? (
          <p className="panel-subtitle">{t.transportEmptyPrompt}</p>
        ) : (
          namedVehicles.map((vehicle, index) => (
            <section className="summary-section" key={vehicle.id}>
              <div className="summary-crop-card">
                <div className="summary-crop-card-head">
                  <strong>{vehicle.type || `${t.vehicleWord} ${index + 1}`}</strong>
                  <StatusBadge status={vehicle.status} t={t} />
                </div>
                <div className="summary-grid">
                  <div><span>{t.capacityLabel}</span><strong>{vehicle.capacity ? `${vehicle.capacity} kg` : '—'}</strong></div>
                  <div><span>{t.regNumber}</span><strong>{vehicle.registrationNumber || '—'}</strong></div>
                  <div><span>{t.vehicleLocation}</span><strong>{vehicle.location || '—'}</strong></div>
                </div>
              </div>

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
            </section>
          ))
        )}

        <button type="button" className="button button-primary add-vehicle-button" onClick={() => setMode('edit')}>+ {t.transportCard}</button>
      </div>
    </div>
  )
}