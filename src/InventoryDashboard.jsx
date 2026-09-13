import { useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

let recordIdCounter = 1

function emptyRecord() {
  recordIdCounter += 1
  return { id: `new-${Date.now()}-${recordIdCounter}`, crop: '', quantity: '', unit: 'kg', harvestDate: '', location: '', status: 'available' }
}

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10)
}

export default function InventoryDashboard({ userId, initialData, language, setLanguage, onBack, onComplete }) {
  const t = useTranslation(language)
  const [tab, setTab] = useState('current')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(() => ({ ...emptyRecord(), harvestDate: todayISO() }))
  const [records, setRecords] = useState(() =>
    (initialData?.inventory?.records || []).map((record) => ({ ...record }))
  )
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const facility = initialData?.inventory
  const currentRecords = records.filter((record) => record.status !== 'sold')
  const pastRecords = records.filter((record) => record.status === 'sold')

  async function doSave(nextRecords) {
    setIsSaving(true)
    setSaveError('')
    try {
      const savedData = await saveLogisticsData(userId, {
        profile: initialData?.profile || null,
        vehicles: initialData?.vehicles || [],
        inventory: { ...(facility || {}), records: nextRecords },
        photo: initialData?.photo || null,
      })
      onComplete(savedData)
      setRecords(savedData.inventory?.records || nextRecords)
      return savedData
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleAddSubmit(event) {
    event.preventDefault()
    const record = {
      ...form,
      crop: String(form.crop || '').trim(),
      quantity: String(form.quantity || '').trim(),
      location: String(form.location || '').trim(),
    }
    if (!record.crop || !record.quantity) return
    const saved = await doSave([...records, record])
    if (saved) {
      setShowAddForm(false)
      setForm({ ...emptyRecord(), harvestDate: todayISO() })
    }
  }

  async function moveToPast(recordId) {
    await doSave(records.map((record) => (record.id === recordId ? { ...record, status: 'sold' } : record)))
  }

  async function restoreRecord(recordId) {
    await doSave(records.map((record) => (record.id === recordId ? { ...record, status: 'available' } : record)))
  }

  const list = tab === 'past' ? pastRecords : currentRecords
  const emptyText = tab === 'past' ? t.noPastInventoryRecords : t.noCurrentInventory
  const hasFacility = Boolean(
    facility && (facility.type || (facility.capacity !== '' && facility.capacity != null) || facility.location || (facility.fill !== '' && facility.fill != null))
  )

  return (
    <div className="profile-page">
      <div className="profile-page-inner" style={{ maxWidth: 900 }}>
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <div className="manage-head">
          <div>
            <p className="eyebrow" style={{ marginBottom: 6 }}>{t.stepInventory}</p>
            <h2>{t.inventoryCard}</h2>
          </div>
        </div>

        <div className="manage-tabs-row">
          <div className="manage-tabs" role="tablist">
            <button type="button" className={`manage-tab ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>{t.currentInventoryLabel}</button>
            <button type="button" className={`manage-tab ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>{t.pastInventoryLabel}</button>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="manage-empty">{emptyText}</p>
        ) : (
          <div className="manage-grid">
            {list.map((record) => {
              const isPast = record.status === 'sold'
              const quantity = record.quantity != null && record.quantity !== ''
                ? `${record.quantity} ${record.unit || ''}`.trim()
                : '—'
              return (
                <div className="manage-card" key={record.id}>
                  <div className="manage-card-head">
                    <strong>{record.crop || '—'}</strong>
                    <span className={`status-badge ${isPast ? 'status-archived' : 'status-active'}`}>
                      {isPast ? t.statusSold : t.statusAvailable}
                    </span>
                  </div>
                  <div className="manage-fields">
                    <div className="manage-field"><span>{t.inventoryQuantityLabel}</span><strong>{quantity}</strong></div>
                    <div className="manage-field"><span>{t.harvestDateShort}</span><strong>{record.harvestDate || '—'}</strong></div>
                    <div className="manage-field"><span>{t.inventoryLocationLabel}</span><strong>{record.location || '—'}</strong></div>
                  </div>
                  <div className="manage-card-actions">
                    {isPast ? (
                      <button type="button" className="button button-quiet" onClick={() => restoreRecord(record.id)} disabled={isSaving}>{t.restoreVehicle}</button>
                    ) : (
                      <button type="button" className="button button-quiet" onClick={() => moveToPast(record.id)} disabled={isSaving}>{t.moveToPastInventory}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'current' && hasFacility && (
          <div className="manage-card" style={{ marginTop: 18 }}>
            <div className="manage-card-head">
              <strong>{t.storageFacilityTitle}</strong>
            </div>
            <div className="manage-fields">
              <div className="manage-field"><span>{t.coldStorageType}</span><strong>{facility.type || '—'}</strong></div>
              <div className="manage-field"><span>{t.coldStorageCapacity}</span>
                <strong>{facility.capacity !== '' && facility.capacity != null ? `${facility.capacity} tonnes` : '—'}</strong>
              </div>
              <div className="manage-field"><span>{t.storageLocation}</span><strong>{facility.location || '—'}</strong></div>
              <div className="manage-field"><span>{t.storageFillLabel}</span>
                <strong>{facility.fill !== '' && facility.fill != null ? `${facility.fill}%` : '—'}</strong>
              </div>
            </div>
          </div>
        )}

        {showAddForm && (
          <form className="profile-form-card manage-add-panel" onSubmit={handleAddSubmit}>
            <h3 className="manage-add-title">{t.addInventoryTitle}</h3>
            <div className="form-grid">
              <label>{t.cropWord}
                <select value={form.crop} onChange={(event) => updateForm('crop', event.target.value)} required>
                  <option value="">{t.selectCrop}</option>
                  {t.cropSuggestions.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
                </select>
              </label>
              <label>{t.inventoryLocationLabel}
                <input type="text" value={form.location} onChange={(event) => updateForm('location', event.target.value)} placeholder={t.storageLocationPlaceholder} />
              </label>
              <label>{t.inventoryQuantityLabel}
                <input type="number" step="0.01" min="0" value={form.quantity} onChange={(event) => updateForm('quantity', event.target.value)} placeholder="0" required />
              </label>
              <label>{t.quantityUnitLabel}
                <select value={form.unit || 'kg'} onChange={(event) => updateForm('unit', event.target.value)}>
                  {t.unitSuggestions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <label>{t.harvestDateShort}
                <input type="date" value={form.harvestDate} onChange={(event) => updateForm('harvestDate', event.target.value)} required />
              </label>
            </div>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <div className="manage-add-actions">
              <button type="button" className="button button-quiet" onClick={() => { setShowAddForm(false); setSaveError('') }}>{t.back}</button>
              <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.addInventoryButton}</button>
            </div>
          </form>
        )}

        {!showAddForm && (
          <div className="manage-foot">
            <button type="button" className="button button-primary" onClick={() => setShowAddForm(true)}>{t.addInventoryButton}</button>
          </div>
        )}
      </div>
    </div>
  )
}