import { useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

const SERVICE_TYPES = [
  { key: 'transportation', icon: '🚚', title: 'Transportation', description: 'Moving produce between farms, storage and buyers with your fleet.' },
  { key: 'storage', icon: '🏬', title: 'Storage services', description: 'Cold storage, warehousing and inventory management for produce.' },
  { key: 'both', icon: '🚛', title: 'Transportation + Storage', description: 'Combine a delivery fleet with cold storage for end-to-end logistics.' },
]

const VEHICLE_TYPES = [
  'Truck', 'Mini truck', 'Container truck', 'Refrigerated van', 'Pickup van', 'Tempo', 'Tanker', 'Tractor trolley', 'Other',
]

export default function CompleteProfileLogistics({ userId, onBack, onComplete, initialData, language, setLanguage }) {
  const t = useTranslation(language)
  const [step, setStep] = useState(initialData?.serviceType ? 'details' : 'choose')
  const [chosen, setChosen] = useState(initialData?.serviceType || null)
  const [vehicleCount, setVehicleCount] = useState(initialData?.vehicleCount || '')
  const [vehicles, setVehicles] = useState(() => (initialData?.vehicles?.length ? initialData.vehicles.map((vehicle) => ({ ...vehicle })) : []))
  const [storage, setStorage] = useState(initialData?.storage || { capacity: '', location: '', fillPercentage: '' })
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const wantTransport = chosen === 'transportation' || chosen === 'both'
  const wantStorage = chosen === 'storage' || chosen === 'both'

  function chooseServiceType(key) {
    setChosen(key)
    setStep('details')
  }

  function updateVehicleCount(value) {
    const count = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0)
    setVehicleCount(value)
    setVehicles((current) => {
      const next = [...current]
      while (next.length < count) next.push({ type: '', location: '', registration: '', capacity: '' })
      return next.slice(0, count)
    })
  }

  function updateVehicle(index, field, value) {
    setVehicles((current) => current.map((vehicle, i) => (i === index ? { ...vehicle, [field]: value } : vehicle)))
  }

  function updateStorage(field, value) {
    setStorage((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    setIsSaving(true)
    try {
      const vehicleRows = wantTransport
        ? vehicles.filter((vehicle) => vehicle.type.trim()).map((vehicle) => ({ type: vehicle.type, location: vehicle.location, registration: vehicle.registration, capacity: vehicle.capacity }))
        : []
      const storageData = wantStorage ? storage : { capacity: '', location: '', fillPercentage: '' }
      const savedData = await saveLogisticsData(userId, { serviceType: chosen, vehicles: vehicleRows, storage: storageData })
      onComplete(savedData)
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
    } finally {
      setIsSaving(false)
    }
  }

  if (step === 'choose') {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <div className="profile-page-topbar">
            <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <p className="eyebrow">COMPLETE YOUR PROFILE</p>
          <h2>What service do you provide?</h2>
          <p className="panel-subtitle">Choose the option that best describes your business. You can add more details next.</p>

          <div className="role-grid">
            {SERVICE_TYPES.map((item) => (
              <button className="role-card" key={item.key} onClick={() => chooseServiceType(item.key)}>
                <span className="role-icon" aria-hidden="true">{item.icon}</span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <span className="role-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <p className="eyebrow">COMPLETE YOUR PROFILE</p>
        <h2>Logistics provider details</h2>
        <p className="panel-subtitle">Fill in the details below so the platform can match you with the right orders.</p>

        <form className="profile-form-card" onSubmit={handleSubmit}>
          <h3 className="form-section-title">Service type</h3>
          <div className="service-type-selector">
            {SERVICE_TYPES.map((item) => (
              <button type="button" key={item.key} className={chosen === item.key ? 'selected' : ''} onClick={() => chooseServiceType(item.key)}>
                <span className="role-icon" aria-hidden="true">{item.icon}</span> {item.title}
              </button>
            ))}
          </div>

          {wantTransport && (
            <section className="logistics-section">
              <h3 className="form-section-title">🚚 Transportation</h3>
              <label>Number of vehicles
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3"
                  value={vehicleCount}
                  onChange={(event) => updateVehicleCount(event.target.value)}
                  required
                />
              </label>

              {vehicles.length > 0 && (
                <div className="crop-section">
                  {vehicles.map((vehicle, index) => (
                    <div className="crop-card" key={index}>
                      <div className="crop-card-header">
                        <label>{`Vehicle ${index + 1} — type`}
                          <select
                            value={vehicle.type}
                            onChange={(event) => updateVehicle(index, 'type', event.target.value)}
                            required
                          >
                            <option value="">Select vehicle type</option>
                            {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </label>
                      </div>

                      {vehicle.type && (
                        <div className="form-grid">
                          <label>Location
                            <input
                              type="text"
                              placeholder="City, district, state"
                              value={vehicle.location}
                              onChange={(event) => updateVehicle(index, 'location', event.target.value)}
                              required
                            />
                          </label>
                          <label>Registration number
                            <input
                              type="text"
                              placeholder="e.g. KA 01 AB 1234"
                              value={vehicle.registration}
                              onChange={(event) => updateVehicle(index, 'registration', event.target.value)}
                              required
                            />
                          </label>
                          <label>Load carrying capacity (kg)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 1500"
                              value={vehicle.capacity}
                              onChange={(event) => updateVehicle(index, 'capacity', event.target.value)}
                              required
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {wantStorage && (
            <section className="logistics-section">
              <h3 className="form-section-title">🏬 Storage services</h3>
              <div className="form-grid">
                <label>Capacity of cold storage (tonnes)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 120"
                    value={storage.capacity}
                    onChange={(event) => updateStorage('capacity', event.target.value)}
                    required
                  />
                </label>
                <label>Location
                  <input
                    type="text"
                    placeholder="City, district, state"
                    value={storage.location}
                    onChange={(event) => updateStorage('location', event.target.value)}
                    required
                  />
                </label>
                <label>Percentage filled (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="e.g. 60"
                    value={storage.fillPercentage}
                    onChange={(event) => updateStorage('fillPercentage', event.target.value)}
                    required
                  />
                </label>
              </div>
              {storage.fillPercentage !== '' && (
                <p className="form-note logistics-note">Remaining capacity: {Math.max(0, 100 - (Number(storage.fillPercentage) || 0))}%</p>
              )}
            </section>
          )}

          <div className="profile-actions">
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
          </div>
        </form>
      </div>
    </div>
  )
}