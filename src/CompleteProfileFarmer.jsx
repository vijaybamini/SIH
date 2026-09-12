import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveFarmerData } from './api/farmer'

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
    <div className="autocomplete-wrap">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => { onChange(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
      />
      {open && filtered.length > 0 && (
        <ul className="autocomplete-list">
          {filtered.slice(0, 8).map((item) => (
            <li key={item} onMouseDown={(event) => { event.preventDefault(); selectSuggestion(item) }}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CompleteProfileFarmer({ userId, onBack, onComplete, initialData, language, setLanguage, initialStep = 0, addCropOnOpen = false }) {
  const t = useTranslation(language)
  const [mode, setMode] = useState(initialData ? 'summary' : 'edit')
  const [editingCrops, setEditingCrops] = useState(addCropOnOpen)
  const formRef = useRef(null)

  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [photoFile, setPhotoFile] = useState(null)
  const [name, setName] = useState(initialData?.name || '')
  const [phone, setPhone] = useState(initialData?.phone || '')
  const [areaOfLand, setAreaOfLand] = useState(initialData?.areaOfLand || '')
  const [surveyNumber, setSurveyNumber] = useState(initialData?.surveyNumber || '')
  const [aadhaarNumber, setAadhaarNumber] = useState(initialData?.aadhaarNumber || '')
  const [cropLocation, setCropLocation] = useState(initialData?.cropLocation || '')
  const [pincode, setPincode] = useState(initialData?.pincode || '')

  const [crops, setCrops] = useState(() => {
    const base = initialData?.crops?.length ? initialData.crops : [emptyCrop()]
    return addCropOnOpen ? [...base, emptyCrop()] : base
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
    const nextValue = field === 'name' || field === 'specificType' ? value.toUpperCase() : value
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

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    setIsSaving(true)
    try {
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
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <div className="profile-page-topbar">
            <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>
          <p className="eyebrow">{t.stepCropDetails}</p>
          <h2>{t.manageCropsTitle}</h2>
          <p className="panel-subtitle">{t.completeYourProfileSubtitle}</p>

          <form className="profile-form-card" onSubmit={handleSubmit} ref={formRef}>
            <div className="crop-section">
              {crops.map((crop, index) => (
                <div className="crop-card" key={crop.id}>
                  <div className="crop-card-header">
                    <label>{`${t.cropWord} ${index + 1} ${t.cropNameLabel}`}
                      <CropAutocomplete
                        value={crop.name}
                        onChange={(value) => updateCrop(crop.id, 'name', value)}
                        suggestions={t.cropSuggestions}
                        placeholder={t.cropNamePlaceholder}
                        required
                      />
                    </label>
                    {crops.length > 1 && (
                      <button type="button" className="remove-crop-button" onClick={() => removeCrop(crop.id)} aria-label={t.removeThisCropLabel}>×</button>
                    )}
                  </div>

                  {crop.name && (
                    <>
                      <label>{t.landUsed}<input type="number" step="0.01" min="0" placeholder={t.landUsedPlaceholder} value={crop.landUsed} onChange={(event) => updateCrop(crop.id, 'landUsed', event.target.value)} required /></label>

                      <label>{t.datePlanted}<input type="date" value={crop.plantedDate} onChange={(event) => updateCrop(crop.id, 'plantedDate', event.target.value)} required /></label>

                      <div className="harvested-toggle">
                        <span>{t.harvestedQuestion}</span>
                        <div className="toggle-buttons">
                          <button type="button" className={crop.harvested === true ? 'selected' : ''} onClick={() => updateCrop(crop.id, 'harvested', true)}>{t.yes}</button>
                          <button type="button" className={crop.harvested === false ? 'selected' : ''} onClick={() => updateCrop(crop.id, 'harvested', false)}>{t.no}</button>
                        </div>
                      </div>

                      {crop.harvested !== null && (
                        <div className="form-grid crop-date-grid">
                          <label>{crop.harvested ? t.dateHarvested : t.expectedHarvestDate}
                            <input type="date" value={crop.expectedHarvestDate} onChange={(event) => updateCrop(crop.id, 'expectedHarvestDate', event.target.value)} required />
                          </label>
                          <label>{crop.harvested ? t.turnover : t.expectedTurnover}
                            <input
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

                      <label>{t.specificTypeOfCrop}
                        <CropAutocomplete
                          value={crop.specificType}
                          onChange={(value) => updateCrop(crop.id, 'specificType', value)}
                          suggestions={t.cropSuggestions}
                          placeholder={t.specificTypePlaceholder}
                          required
                        />
                      </label>
                    </>
                  )}
                </div>
              ))}

              <button type="button" className="add-crop-button" onClick={addCrop}>
                <span aria-hidden="true">+</span> {t.addAnotherCrop}
              </button>
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
            <label>{t.phone}<input type="tel" placeholder={t.phonePlaceholder} value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
            <label>{t.areaOfLand}<input type="number" step="0.01" min="0" placeholder={t.areaOfLandPlaceholder} value={areaOfLand} onChange={(event) => setAreaOfLand(event.target.value)} required /></label>
            <label>{t.surveyNumber}<input type="text" placeholder={t.surveyNumberPlaceholder} value={surveyNumber} onChange={(event) => setSurveyNumber(event.target.value.toUpperCase())} required /></label>
            <label>{t.aadhaarNumber}<input type="text" placeholder={t.aadhaarPlaceholder} value={aadhaarNumber} onChange={(event) => setAadhaarNumber(event.target.value.toUpperCase())} required /></label>
            <label>{t.locationOfCrop}<input type="text" placeholder={t.cropLocationPlaceholder} value={cropLocation} onChange={(event) => setCropLocation(event.target.value.toUpperCase())} required /></label>
            <label>{t.pincode}<input type="text" inputMode="numeric" pattern="[0-9]{6}" placeholder={t.pincodePlaceholder} value={pincode} onChange={(event) => setPincode(event.target.value)} required /></label>
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