import { useState } from 'react'
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

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-400'

export default function InventoryDashboard({ userId, initialData, t, onComplete }) {
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

  const stats = [
    ['Available records', currentRecords.length],
    ['Sold', pastRecords.length],
    ['Facility fill', facility?.fill !== '' && facility?.fill != null ? `${facility.fill}%` : '—'],
  ]

  return (
    <div>
        <div className="mb-8 grid grid-cols-3 gap-4">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</span>
              <strong className="mt-1 block font-display text-3xl font-bold text-brand-900">{value}</strong>
            </div>
          ))}
        </div>

        <div className="mb-5 inline-flex rounded-xl bg-cream-100 p-1">
          <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'current' ? 'bg-white text-brand-900 shadow-sm' : 'text-[var(--text-muted)]'}`} onClick={() => setTab('current')}>{t.currentInventoryLabel}</button>
          <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'past' ? 'bg-white text-brand-900 shadow-sm' : 'text-[var(--text-muted)]'}`} onClick={() => setTab('past')}>{t.pastInventoryLabel}</button>
        </div>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">{emptyText}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((record) => {
              const isPast = record.status === 'sold'
              const quantity = record.quantity != null && record.quantity !== ''
                ? `${record.quantity} ${record.unit || ''}`.trim()
                : '—'
              return (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" key={record.id}>
                  <div className="mb-3.5 flex items-center justify-between gap-2">
                    <strong className="text-base text-brand-900">{record.crop || '—'}</strong>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isPast ? 'bg-cream-200 text-[var(--text-muted)]' : 'bg-brand-100 text-brand-700'}`}>
                      {isPast ? t.statusSold : t.statusAvailable}
                    </span>
                  </div>
                  <div className="grid gap-2.5">
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.inventoryQuantityLabel}</span><strong className="text-brand-900">{quantity}</strong></div>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.harvestDateShort}</span><strong className="text-brand-900">{record.harvestDate || '—'}</strong></div>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.inventoryLocationLabel}</span><strong className="text-brand-900">{record.location || '—'}</strong></div>
                  </div>
                  <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3.5">
                    {isPast ? (
                      <button type="button" className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => restoreRecord(record.id)} disabled={isSaving}>{t.restoreVehicle}</button>
                    ) : (
                      <button type="button" className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => moveToPast(record.id)} disabled={isSaving}>{t.moveToPastInventory}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'current' && hasFacility && (
          <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-brand-50 p-5">
            <strong className="mb-3.5 block text-base text-brand-900">{t.storageFacilityTitle}</strong>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.coldStorageType}</span><strong className="text-brand-900">{facility.type || '—'}</strong></div>
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.coldStorageCapacity}</span>
                <strong className="text-brand-900">{facility.capacity !== '' && facility.capacity != null ? `${facility.capacity} tonnes` : '—'}</strong>
              </div>
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.storageLocation}</span><strong className="text-brand-900">{facility.location || '—'}</strong></div>
              <div className="flex items-baseline justify-between text-sm"><span className="text-[var(--text-muted)]">{t.storageFillLabel}</span>
                <strong className="text-brand-900">{facility.fill !== '' && facility.fill != null ? `${facility.fill}%` : '—'}</strong>
              </div>
            </div>
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAddSubmit} className="mt-6 grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
            <h3 className="font-display text-lg font-bold text-brand-900">{t.addInventoryTitle}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>{t.cropWord}
                <select className={inputClass} value={form.crop} onChange={(event) => updateForm('crop', event.target.value)} required>
                  <option value="">{t.selectCrop}</option>
                  {t.cropSuggestions.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
                </select>
              </label>
              <label className={labelClass}>{t.inventoryLocationLabel}
                <input className={inputClass} type="text" value={form.location} onChange={(event) => updateForm('location', event.target.value)} placeholder={t.storageLocationPlaceholder} />
              </label>
              <label className={labelClass}>{t.inventoryQuantityLabel}
                <input className={inputClass} type="number" step="0.01" min="0" value={form.quantity} onChange={(event) => updateForm('quantity', event.target.value)} placeholder="0" required />
              </label>
              <label className={labelClass}>{t.quantityUnitLabel}
                <select className={inputClass} value={form.unit || 'kg'} onChange={(event) => updateForm('unit', event.target.value)}>
                  {t.unitSuggestions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <label className={labelClass}>{t.harvestDateShort}
                <input className={inputClass} type="date" value={form.harvestDate} onChange={(event) => updateForm('harvestDate', event.target.value)} required />
              </label>
            </div>
            {saveError && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{saveError}</p>}
            <div className="flex gap-2.5">
              <button type="button" className="rounded-lg px-4 py-3 text-sm font-semibold text-brand-800 hover:text-brand-600" onClick={() => { setShowAddForm(false); setSaveError('') }}>{t.back}</button>
              <button type="submit" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" disabled={isSaving}>{isSaving ? t.savingButton : t.addInventoryButton}</button>
            </div>
          </form>
        )}

        {!showAddForm && (
          <div className="mt-6">
            <button type="button" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => setShowAddForm(true)}>{t.addInventoryButton}</button>
          </div>
        )}
    </div>
  )
}
