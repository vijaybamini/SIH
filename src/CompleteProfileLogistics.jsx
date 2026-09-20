import { useRef, useState } from 'react'
import { saveLogisticsData } from './api/logistics'

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-400'

export default function CompleteProfileLogistics({ userId, onComplete, initialData, t }) {
  const formRef = useRef(null)
  const [profile, setProfile] = useState({
    name: initialData?.profile?.name || '',
    aadhaarNumber: initialData?.profile?.aadhaarNumber || '',
    phone: initialData?.profile?.phone || '',
    address: initialData?.profile?.address || '',
  })
  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [photoFile, setPhotoFile] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function updateProfile(field, value) {
    if (field === 'aadhaarNumber') value = value.replace(/\D/g, '').slice(0, 12)
    if (field === 'phone') value = value.replace(/\D/g, '').slice(0, 10)
    setProfile((current) => ({ ...current, [field]: value }))
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (formRef.current && !formRef.current.reportValidity()) return
    setSaveError('')
    setIsSaving(true)
    try {
      const savedData = await saveLogisticsData(userId, {
        profile,
        vehicles: initialData?.vehicles || [],
        inventory: initialData?.inventory || null,
        photo,
        photoFile,
      })
      onComplete(savedData)
      setPhoto(savedData.photo)
      setPhotoFile(null)
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-400">{t.stepProfile}</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-brand-900">{t.editProfile}</h2>
        <p className="mt-2 mb-7 text-[15px] text-[var(--text-muted)]">{t.basicDetails}</p>

        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{t.name}
              <input className={inputClass} value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} placeholder={t.namePlaceholder} required />
            </label>
            <label className={labelClass}>{t.aadhaarNumber}
              <input className={inputClass} inputMode="numeric" pattern="[0-9]{12}" value={profile.aadhaarNumber} onChange={(event) => updateProfile('aadhaarNumber', event.target.value)} placeholder={t.aadhaarPlaceholder} required />
            </label>
            <label className={labelClass}>{t.phone}
              <input className={inputClass} type="tel" inputMode="numeric" pattern="[0-9]{10}" value={profile.phone} onChange={(event) => updateProfile('phone', event.target.value)} placeholder={t.phonePlaceholder} required />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>{t.address}
              <textarea className={`${inputClass} min-h-[90px] resize-y`} value={profile.address} onChange={(event) => updateProfile('address', event.target.value)} placeholder={t.addressPlaceholder} required />
            </label>
          </div>

          <div className="flex items-center gap-4 border-t border-[var(--border-subtle)] pt-5">
            {saveError && <p className="flex-1 rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{saveError}</p>}
            <button type="submit" className="ml-auto rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
          </div>
        </form>
    </div>
  )
}
