import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

export default function InventoryDashboard({ userId, initialData, language, setLanguage, onBack, onComplete }) {
  const t = useTranslation(language)
  const formRef = useRef(null)
  const [mode, setMode] = useState(() => {
    const inventory = initialData?.inventory
    return Boolean(inventory?.type && inventory?.location && inventory?.capacity !== '' && inventory?.fill !== '') ? 'overview' : 'edit'
  })
  const [inventory, setInventory] = useState({
    type: initialData?.inventory?.type || '',
    capacity: initialData?.inventory?.capacity || '',
    location: initialData?.inventory?.location || '',
    fill: initialData?.inventory?.fill || '',
  })
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function doSave(nextInventory) {
    setIsSaving(true)
    setSaveError('')
    try {
      const savedData = await saveLogisticsData(userId, {
        profile: initialData?.profile || null,
        vehicles: initialData?.vehicles || [],
        inventory: nextInventory,
      })
      onComplete(savedData)
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
    const savedData = await doSave(inventory)
    if (savedData) setMode('overview')
  }

  if (mode === 'edit') {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <div className="profile-page-topbar">
            <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <p className="eyebrow">{t.stepInventory}</p>
          <h2>{t.inventoryDetailsTitle}</h2>
          <p className="panel-subtitle">{t.inventoryDetailsSub}</p>

          <form className="profile-form-card" onSubmit={handleSubmit} ref={formRef}>
            <div className="form-grid">
              <label>{t.coldStorageType}
                <input type="text" placeholder={t.coldStorageTypePlaceholder} value={inventory.type} onChange={(event) => setInventory({ ...inventory, type: event.target.value.toUpperCase() })} required />
              </label>
              <label>{t.coldStorageCapacity}
                <input type="number" step="0.01" min="0" placeholder={t.coldStorageCapacityPlaceholder} value={inventory.capacity} onChange={(event) => setInventory({ ...inventory, capacity: event.target.value })} required />
              </label>
              <label>{t.storageLocation}
                <input type="text" placeholder={t.storageLocationPlaceholder} value={inventory.location} onChange={(event) => setInventory({ ...inventory, location: event.target.value.toUpperCase() })} required />
              </label>
              <label>{t.storageFill}
                <input type="number" min="0" max="100" step="1" placeholder={t.storageFillPlaceholder} value={inventory.fill} onChange={(event) => setInventory({ ...inventory, fill: event.target.value })} required />
              </label>
            </div>

            <div className="profile-actions">
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
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
          <div className="profile-summary-photo profile-summary-photo-empty" aria-hidden="true">❄</div>
          <div className="profile-summary-header-text">
            <p className="eyebrow">{t.stepInventory}</p>
            <h2>{t.inventoryDetailsTitle}</h2>
          </div>
          <button className="button button-primary" onClick={() => setMode('edit')}>{t.editProfile}</button>
        </div>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <div className="summary-section">
          <div className="summary-grid">
            <div><span>{t.coldStorageType}</span><strong>{inventory.type || '—'}</strong></div>
            <div><span>{t.coldStorageCapacity}</span><strong>{inventory.capacity !== '' ? `${inventory.capacity} tonnes` : '—'}</strong></div>
            <div><span>{t.storageLocation}</span><strong>{inventory.location || '—'}</strong></div>
            <div><span>{t.storageFillLabel}</span><strong>{inventory.fill !== '' ? `${inventory.fill}%` : '—'}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}