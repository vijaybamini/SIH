import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import PincodeHint, { PINCODE_PATTERN } from './PincodeHint'
import { useTranslation } from './i18n'
import { saveFarmerData } from './api/farmer'
import { toEnglishCropName, maxCropCycleDays } from './cropNames'
import { supabase } from './supabase'

const PHONE_PATTERN = /^[6-9][0-9]{9}$/
const AADHAAR_PATTERN = /^[0-9]{12}$/

const cropInputClass = 'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const cropLabelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-400'

let cropIdCounter = 1

function emptyCrop() {
  cropIdCounter += 1
  return { id: `new-${Date.now()}-${cropIdCounter}`, name: '', landUsed: '', harvested: null, turnover: '', specificType: '', plantedDate: '', expectedHarvestDate: '' }
}

function CropAutocomplete({ value, onChange, suggestions, placeholder, required }) {
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)
  const filtered = value
    ? suggestions.filter((item) => item.toLowerCase().includes(value.toLowerCase()))
    : suggestions

  function selectSuggestion(item) {
    clearTimeout(blurTimer.current)
    onChange(item)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3.5 text-base font-semibold text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => { onChange(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-lg shadow-brand-900/10">
          {filtered.slice(0, 8).map((item) => (
            <li
              key={item}
              className="cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-50 hover:text-brand-700"
              onMouseDown={(event) => { event.preventDefault(); selectSuggestion(item) }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CompleteProfileFarmer({ userId, onBack, onComplete, initialData, currentEmail, onEmailUpdateRequested, language, setLanguage, initialStep = 0, addCropOnOpen = false }) {
  const t = useTranslation(language)
  const [mode, setMode] = useState(initialData ? 'summary' : 'edit')
  const [editingCrops, setEditingCrops] = useState(addCropOnOpen)
  const formRef = useRef(null)

  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [photoFile, setPhotoFile] = useState(null)
  const [name, setName] = useState(initialData?.name || '')
  const [phone, setPhone] = useState(initialData?.phone || '')
  const [email, setEmail] = useState(currentEmail || '')
  const [emailUpdateStatus, setEmailUpdateStatus] = useState('idle')
  const [areaOfLand, setAreaOfLand] = useState(initialData?.areaOfLand || '')
  const [surveyNumber, setSurveyNumber] = useState(initialData?.surveyNumber || '')
  const [aadhaarNumber, setAadhaarNumber] = useState(initialData?.aadhaarNumber || '')
  const [cropLocation, setCropLocation] = useState(initialData?.cropLocation || '')
  const [pincode, setPincode] = useState(initialData?.pincode || '')

  const [crops, setCrops] = useState(() => {
    const existing = initialData?.crops?.length ? initialData.crops : []
    // Only append a fresh blank crop on top of ones that already exist --
    // when there are none yet, a lone blank crop (below) is already "the
    // one to add," so appending another here would show two empty fields
    // for a farmer's very first crop.
    if (addCropOnOpen && existing.length) return [...existing, emptyCrop()]
    return existing.length ? existing : [emptyCrop()]
  })

  const [accountHolderName, setAccountHolderName] = useState(initialData?.bank?.accountHolderName || '')
  const [accountNumber, setAccountNumber] = useState(initialData?.bank?.accountNumber || '')
  const [ifsc, setIfsc] = useState(initialData?.bank?.ifsc || '')
  const [branch, setBranch] = useState(initialData?.bank?.branch || '')
  const [ifscStatus, setIfscStatus] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
  }

  function updateCrop(id, field, value) {
    // Crop name is canonicalized to English regardless of what language it
    // was typed/selected in -- it's stored and matched against the AI
    // backend's (English-only) commodity list, not just displayed.
    const nextValue = field === 'name' ? toEnglishCropName(value).toUpperCase() : value
    setCrops((current) => current.map((crop) => (crop.id === id ? { ...crop, [field]: nextValue } : crop)))
  }
  function addCrop() {
    setCrops((current) => [...current, emptyCrop()])
  }
  function removeCrop(id) {
    setCrops((current) => current.filter((crop) => crop.id !== id))
  }

  async function handleIfscChange(event) {
    const value = event.target.value.toUpperCase().slice(0, 11)
    setIfsc(value)
    if (value.length !== 11) {
      setIfscStatus('idle')
      return
    }
    setIfscStatus('loading')
    try {
      const response = await fetch(`https://ifsc.razorpay.com/${value}`)
      if (!response.ok) throw new Error('IFSC not found')
      const data = await response.json()
      setBranch(data.BRANCH || '')
      setIfscStatus('found')
    } catch {
      setIfscStatus('notfound')
    }
  }

  async function handleEmailUpdate() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || trimmed === (currentEmail || '').toLowerCase()) return
    setEmailUpdateStatus('saving')
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed })
      if (error) throw error
      setEmailUpdateStatus('confirm-sent')
      onEmailUpdateRequested?.(trimmed)
    } catch (error) {
      setEmailUpdateStatus('error')
      setSaveError(error.message || t.couldNotSaveProfile)
    }
  }

  function validateCrops() {
    const namedCrops = crops.filter((crop) => crop.name)

    const totalLandUsed = namedCrops.reduce((sum, crop) => sum + (Number(crop.landUsed) || 0), 0)
    const totalFarmArea = Number(areaOfLand)
    if (totalFarmArea > 0 && totalLandUsed > totalFarmArea + 0.001) {
      return t.validationCropLandExceeds
        .replace('{used}', totalLandUsed.toFixed(2))
        .replace('{total}', totalFarmArea)
    }

    for (const crop of namedCrops) {
      if (!crop.plantedDate || !crop.expectedHarvestDate) continue
      const days = (new Date(crop.expectedHarvestDate) - new Date(crop.plantedDate)) / 86400000
      const limit = maxCropCycleDays(crop.name)
      if (days > limit) {
        return t.validationCropCycleTooLong
          .replace('{crop}', crop.name)
          .replace('{months}', Math.round(limit / 30))
      }
    }
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    const cropsError = validateCrops()
    if (cropsError) {
      setSaveError(cropsError)
      return
    }
    setIsSaving(true)
    try {
      await handleEmailUpdate()
      const savedData = await saveFarmerData(userId, {
        name,
        phone,
        photo,
        photoFile,
        areaOfLand,
        surveyNumber,
        aadhaarNumber,
        cropLocation,
        pincode,
        crops,
        bank: { accountHolderName, accountNumber, ifsc, branch },
      })
      onComplete(savedData)
      setPhoto(savedData.photo)
      setPhotoFile(null)
      setName(savedData.name)
      setPhone(savedData.phone)
      setEditingCrops(false)
      setMode('summary')
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
    } finally {
      setIsSaving(false)
    }
  }

  const namedCrops = crops.filter((crop) => crop.name)

  function computeCompletionPercent() {
    const profileFlags = [Boolean(name), Boolean(phone), Boolean(areaOfLand), Boolean(surveyNumber), Boolean(aadhaarNumber), Boolean(cropLocation), Boolean(pincode)]
    const bankFlags = [Boolean(accountHolderName), Boolean(accountNumber), Boolean(ifsc), Boolean(branch)]
    const allFlags = [...profileFlags, ...bankFlags]
    const filled = allFlags.filter(Boolean).length
    return Math.round((filled / allFlags.length) * 100)
  }

  const completionPercent = computeCompletionPercent()

  if (editingCrops) {
    const totalLandUsed = namedCrops.reduce((sum, crop) => sum + (Number(crop.landUsed) || 0), 0)
    const totalFarmArea = Number(areaOfLand) || 0
    const landPct = totalFarmArea > 0 ? Math.min(100, (totalLandUsed / totalFarmArea) * 100) : 0
    const landOver = totalFarmArea > 0 && totalLandUsed > totalFarmArea + 0.001

    return (
      <div className="min-h-screen bg-cream-100 px-6 py-11">
        <div className="mx-auto max-w-[720px]">
          <div className="mb-6 flex items-center justify-between">
            <button type="button" className="text-sm font-bold text-brand-800 hover:text-brand-600" onClick={onBack}>{t.backToDashboard}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-400">{t.stepCropDetails}</p>
          <h2 className="font-display text-[32px] font-semibold text-brand-900">{t.manageCropsTitle}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{t.completeYourProfileSubtitle}</p>

          {totalFarmArea > 0 && (
            <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-brand-900">{t.landBudgetLabel}</span>
                <span className={`font-bold tabular-nums ${landOver ? 'text-[var(--color-error)]' : 'text-brand-700'}`}>
                  {totalLandUsed.toFixed(2)} / {totalFarmArea} {t.acres}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-brand-100">
                <div className={`h-full rounded-full transition-all ${landOver ? 'bg-[var(--color-error)]' : 'bg-brand-600'}`} style={{ width: `${landPct}%` }} />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} ref={formRef} className="mt-7">
            <div className="flex flex-col gap-5">
              {crops.map((crop, index) => (
                <div key={crop.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 shadow-sm shadow-brand-900/[0.03]">
                  <div className="mb-5 flex items-start gap-3.5">
                    <span className="mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{index + 1}</span>
                    <label className="flex-1">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-brand-400">{`${t.cropWord} ${index + 1} ${t.cropNameLabel}`}</span>
                      <CropAutocomplete
                        value={crop.name}
                        onChange={(value) => updateCrop(crop.id, 'name', value)}
                        suggestions={t.cropSuggestions}
                        placeholder={t.cropNamePlaceholder}
                        required
                      />
                    </label>
                    {crops.length > 1 && (
                      <button
                        type="button"
                        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-error-bg)] text-lg text-[var(--color-error)] transition-colors hover:brightness-95"
                        onClick={() => removeCrop(crop.id)}
                        aria-label={t.removeThisCropLabel}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {crop.name && (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className={cropLabelClass}>{t.landUsed}
                          <input className={cropInputClass} type="number" step="0.01" min="0" placeholder={t.landUsedPlaceholder} value={crop.landUsed} onChange={(event) => updateCrop(crop.id, 'landUsed', event.target.value)} required />
                        </label>
                        <label className={cropLabelClass}>{t.datePlanted}
                          <input className={cropInputClass} type="date" value={crop.plantedDate} onChange={(event) => updateCrop(crop.id, 'plantedDate', event.target.value)} required />
                        </label>
                      </div>

                      <div>
                        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-brand-400">{t.harvestedQuestion}</span>
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            className={`flex-1 rounded-xl border-2 py-3 text-sm font-bold transition-colors ${crop.harvested === true ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--border-subtle)] bg-[var(--surface)] text-brand-900 hover:border-brand-300'}`}
                            onClick={() => updateCrop(crop.id, 'harvested', true)}
                          >
                            {t.yes}
                          </button>
                          <button
                            type="button"
                            className={`flex-1 rounded-xl border-2 py-3 text-sm font-bold transition-colors ${crop.harvested === false ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--border-subtle)] bg-[var(--surface)] text-brand-900 hover:border-brand-300'}`}
                            onClick={() => updateCrop(crop.id, 'harvested', false)}
                          >
                            {t.no}
                          </button>
                        </div>
                      </div>

                      {crop.harvested !== null && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className={cropLabelClass}>{crop.harvested ? t.dateHarvested : t.expectedHarvestDate}
                            <input className={cropInputClass} type="date" value={crop.expectedHarvestDate} onChange={(event) => updateCrop(crop.id, 'expectedHarvestDate', event.target.value)} required />
                          </label>
                          <label className={cropLabelClass}>{crop.harvested ? t.turnover : t.expectedTurnover}
                            <input
                              className={cropInputClass}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={t.turnoverPlaceholder}
                              value={crop.turnover}
                              onChange={(event) => updateCrop(crop.id, 'turnover', event.target.value)}
                              required
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addCrop}
                className="flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-6 py-5 text-base font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
              >
                <span aria-hidden="true" className="text-xl">+</span> {t.addAnotherCrop}
              </button>
            </div>

            <div className="mt-7 flex flex-col items-end gap-3">
              {saveError && <p className="w-full rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{saveError}</p>}
              <button type="submit" className="rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" disabled={isSaving}>
                {isSaving ? t.savingButton : t.saveFinish}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'summary') {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <div className="profile-page-topbar">
            <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <div className="profile-summary-header">
            {photo ? (
              <img className="profile-summary-photo" src={photo} alt="" />
            ) : (
              <div className="profile-summary-photo profile-summary-photo-empty" aria-hidden="true">{(name || accountHolderName || 'F')[0]}</div>
            )}
            <div className="profile-summary-header-text">
              <p className="eyebrow">{t.yourProfileEyebrow}</p>
              <h2>{t.completeYourProfileTitle}</h2>
            </div>
            <button className="button button-primary" onClick={() => setMode('edit')}>{t.editProfile}</button>
          </div>

          <div className="summary-section">
            <h3>{t.stepProfile}</h3>
            <div className="summary-grid">
              <div><span>{t.name}</span><strong>{name || '—'}</strong></div>
              <div><span>{t.phone}</span><strong>{phone || '—'}</strong></div>
              <div><span>{t.areaOfLand}</span><strong>{areaOfLand || '—'}</strong></div>
              <div><span>{t.surveyNumber}</span><strong>{surveyNumber || '—'}</strong></div>
              <div><span>{t.aadhaarNumber}</span><strong>{aadhaarNumber || '—'}</strong></div>
              <div><span>{t.locationOfCrop}</span><strong>{cropLocation || '—'}</strong></div>
              <div><span>{t.pincode}</span><strong>{pincode || '—'}</strong></div>
            </div>
          </div>

          <div className="summary-section">
            <h3>{t.stepBankDetails}</h3>
            <div className="summary-grid">
              <div><span>{t.accountHolderName}</span><strong>{accountHolderName || '—'}</strong></div>
              <div><span>{t.accountNumber}</span><strong>{accountNumber || '—'}</strong></div>
              <div><span>{t.ifscCode}</span><strong>{ifsc || '—'}</strong></div>
              <div><span>{t.branch}</span><strong>{branch || '—'}</strong></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={() => (initialData ? setMode('summary') : onBack())}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>
        <p className="eyebrow">{t.completeProfileEyebrow}</p>
        <h2>{t.completeYourProfileTitle}</h2>
        <p className="panel-subtitle">{t.completeYourProfileSubtitle}</p>

        <div className="completion-bar-row">
          <div className="progress-track completion-track">
            <div className="progress-fill completion-fill" style={{ width: `${completionPercent}%` }} />
          </div>
          <span className="completion-pct">{t.percentComplete.replace('{n}', completionPercent)}</span>
        </div>

        <form className="profile-form-card" onSubmit={handleSubmit} ref={formRef}>
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
            <label>{t.name}<input type="text" placeholder={t.namePlaceholder} value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>{t.phone}<input type="tel" inputMode="numeric" maxLength={10} pattern={PHONE_PATTERN.source} title={t.validationPhoneInvalid} placeholder={t.phonePlaceholder} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} required /></label>
            <label>{t.emailOptional}
              <input type="email" placeholder={t.emailPlaceholder} value={email} onChange={(event) => { setEmail(event.target.value); setEmailUpdateStatus('idle') }} />
              <small className="ifsc-hint">
                {emailUpdateStatus === 'saving' && t.emailUpdateSaving}
                {emailUpdateStatus === 'confirm-sent' && <span className="ifsc-hint-ok">{t.emailUpdateConfirmSent}</span>}
                {emailUpdateStatus === 'error' && <span className="ifsc-hint-warn">{t.emailUpdateError}</span>}
                {emailUpdateStatus === 'idle' && !currentEmail && t.emailOptionalHint}
              </small>
            </label>
            <label>{t.areaOfLand}<input type="number" step="0.01" min="0" placeholder={t.areaOfLandPlaceholder} value={areaOfLand} onChange={(event) => setAreaOfLand(event.target.value)} required /></label>
            <label>{t.surveyNumber}<input type="text" placeholder={t.surveyNumberPlaceholder} value={surveyNumber} onChange={(event) => setSurveyNumber(event.target.value.toUpperCase())} required /></label>
            <label>{t.aadhaarNumber}
              <input type="text" inputMode="numeric" maxLength={12} pattern={AADHAAR_PATTERN.source} title={t.validationAadhaarInvalid} placeholder={t.aadhaarPlaceholder} value={aadhaarNumber} onChange={(event) => setAadhaarNumber(event.target.value.replace(/\D/g, '').slice(0, 12))} required />
            </label>
            <label>{t.locationOfCrop}<input type="text" placeholder={t.cropLocationPlaceholder} value={cropLocation} onChange={(event) => setCropLocation(event.target.value.toUpperCase())} required /></label>
            <label>{t.pincode}
              <input type="text" inputMode="numeric" maxLength={6} pattern={PINCODE_PATTERN.source} title={t.validationPincodeInvalid} placeholder={t.pincodePlaceholder} value={pincode} onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
              <PincodeHint pincode={pincode} t={t} />
            </label>
          </div>

          <h3 className="form-section-title">{t.stepBankDetails}</h3>

          <div className="form-grid">
            <label>{t.accountHolderName}<input type="text" placeholder={t.accountHolderPlaceholder} value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value.toUpperCase())} required /></label>
            <label>{t.accountNumber}<input type="text" placeholder={t.accountNumberPlaceholder} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.toUpperCase())} required /></label>
            <label>{t.ifscCode}
              <input type="text" placeholder={t.ifscPlaceholder} value={ifsc} onChange={handleIfscChange} maxLength={11} required />
              {ifscStatus === 'loading' && <small className="ifsc-hint">{t.ifscLookingUp}</small>}
              {ifscStatus === 'found' && <small className="ifsc-hint ifsc-hint-ok">{t.ifscFound}</small>}
              {ifscStatus === 'notfound' && <small className="ifsc-hint ifsc-hint-warn">{t.ifscNotFound}</small>}
            </label>
            <label>{t.branch}
              <input type="text" placeholder={t.branchPlaceholder} value={branch} onChange={(event) => setBranch(event.target.value.toUpperCase())} required />
            </label>
          </div>

          <div className="profile-actions">
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            {namedCrops.length > 0 && <p className="form-note">{t.namedCropsSaved.replace('{n}', namedCrops.length)}</p>}
            <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
          </div>
        </form>
      </div>
    </div>
  )
}