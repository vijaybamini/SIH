import { useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveServiceData } from './api/service'

let millIdCounter = 1

function emptyMill() {
  millIdCounter += 1
  return { id: `new-${Date.now()}-${millIdCounter}`, cropTypes: [''], gstin: '', documentUrl: null, documentFile: null }
}

export default function CompleteProfileService({ userId, onBack, onComplete, initialData, language, setLanguage }) {
  const t = useTranslation(language)
  const [mode, setMode] = useState(initialData?.profileComplete ? 'summary' : 'edit')

  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [photoFile, setPhotoFile] = useState(null)
  const [name, setName] = useState(initialData?.name || '')
  const [phone, setPhone] = useState(initialData?.phone || '')
  const [email, setEmail] = useState(initialData?.email || '')
  const [address, setAddress] = useState(initialData?.address || '')

  const [millCount, setMillCount] = useState(initialData?.mills?.length ? String(initialData.mills.length) : '')
  const [mills, setMills] = useState(() => (initialData?.mills?.length ? initialData.mills.map((mill) => ({ ...mill, documentFile: null })) : []))

  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function updateMillCount(value) {
    const count = value === '' ? 0 : Math.max(0, Math.min(20, parseInt(value, 10) || 0))
    setMillCount(value)
    setMills((current) => {
      const next = [...current]
      while (next.length < count) next.push(emptyMill())
      return next.slice(0, count)
    })
  }

  function updateMillCropType(millId, cropIndex, value) {
    setMills((current) => current.map((mill) => (mill.id === millId
      ? { ...mill, cropTypes: mill.cropTypes.map((crop, i) => (i === cropIndex ? value : crop)) }
      : mill)))
  }
  function addMillCropType(millId) {
    setMills((current) => current.map((mill) => (mill.id === millId ? { ...mill, cropTypes: [...mill.cropTypes, ''] } : mill)))
  }
  function removeMillCropType(millId, cropIndex) {
    setMills((current) => current.map((mill) => (mill.id === millId
      ? { ...mill, cropTypes: mill.cropTypes.filter((_, i) => i !== cropIndex) }
      : mill)))
  }
  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
  }

  function updateMillGstin(millId, value) {
    setMills((current) => current.map((mill) => (mill.id === millId ? { ...mill, gstin: value.toUpperCase() } : mill)))
  }
  function handleMillDocChange(millId, event) {
    const file = event.target.files?.[0]
    if (!file) return
    setMills((current) => current.map((mill) => (mill.id === millId ? { ...mill, documentFile: file, documentUrl: URL.createObjectURL(file) } : mill)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    setIsSaving(true)
    try {
      const savedData = await saveServiceData(userId, { name, phone, email, address, mills, photo, photoFile })
      onComplete(savedData)
      setPhoto(savedData.photo)
      setPhotoFile(null)
      setMills(savedData.mills.map((mill) => ({ ...mill, documentFile: null })))
      setMillCount(savedData.mills.length ? String(savedData.mills.length) : '')
      setMode('summary')
    } catch (error) {
      setSaveError(error.message || t.couldNotSaveProfile)
    } finally {
      setIsSaving(false)
    }
  }

  function computeCompletionPercent() {
    const profileFlags = [Boolean(name), Boolean(phone), Boolean(address)]
    const millFlags = mills.flatMap((mill) => [Boolean(mill.cropTypes.some((crop) => crop)), Boolean(mill.gstin)])
    const allFlags = [...profileFlags, ...millFlags]
    const filled = allFlags.filter(Boolean).length
    return Math.round((filled / allFlags.length) * 100)
  }
  const completionPercent = computeCompletionPercent()

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
              <div className="profile-summary-photo profile-summary-photo-empty" aria-hidden="true">{(name || 'S')[0]}</div>
            )}
            <div className="profile-summary-header-text">
              <p className="eyebrow">{t.yourProfileEyebrow}</p>
              <h2>Service provider profile</h2>
            </div>
            <button className="button button-primary" onClick={() => setMode('edit')}>{t.editProfile}</button>
          </div>

          <div className="summary-section">
            <h3>{t.stepProfile}</h3>
            <div className="summary-grid">
              <div><span>{t.name}</span><strong>{name || '—'}</strong></div>
              <div><span>{t.phone}</span><strong>{phone || '—'}</strong></div>
              <div><span>{t.email}</span><strong>{email || '—'}</strong></div>
              <div><span>{t.address}</span><strong>{address || '—'}</strong></div>
            </div>
          </div>

          <div className="summary-section">
            <h3>Mill details</h3>
            {mills.length === 0 ? (
              <div className="empty-card"><p>No mills added yet.</p></div>
            ) : mills.map((mill, index) => (
              <div className="summary-crop-card" key={mill.id}>
                <strong>{`Mill ${index + 1}`}</strong>
                <div className="summary-grid">
                  <div><span>Crop services</span><strong>{mill.cropTypes.filter(Boolean).join(', ') || '—'}</strong></div>
                  <div><span>GSTIN</span><strong>{mill.gstin || '—'}</strong></div>
                </div>
                {mill.documentUrl && <p className="form-note"><a href={mill.documentUrl} target="_blank" rel="noreferrer">📄 View uploaded document</a></p>}
              </div>
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
          <button className="back-button" onClick={() => (initialData ? setMode('summary') : onBack())}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>
        <p className="eyebrow">{t.completeProfileEyebrow}</p>
        <h2>Service provider profile details</h2>
        <p className="panel-subtitle">Tell us about you and the mills you run so buyers and the platform can verify and trust your services.</p>

        <div className="completion-bar-row">
          <div className="progress-track completion-track">
            <div className="progress-fill completion-fill" style={{ width: `${completionPercent}%` }} />
          </div>
          <span className="completion-pct">{t.percentComplete.replace('{n}', completionPercent)}</span>
        </div>

        <form className="profile-form-card" onSubmit={handleSubmit}>
          <h3 className="form-section-title">{t.stepProfile}</h3>
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
            <label>{t.email} (optional)<input type="email" placeholder={t.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          </div>
          <label>{t.address}<textarea placeholder={t.addressPlaceholder} value={address} onChange={(event) => setAddress(event.target.value.toUpperCase())} required /></label>

          <h3 className="form-section-title">Mill details</h3>
          <label>How many mills do you currently own?
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              placeholder="e.g. 2"
              value={millCount}
              onChange={(event) => updateMillCount(event.target.value)}
              required
            />
          </label>

          {mills.length > 0 && (
            <div className="crop-section">
              {mills.map((mill, index) => (
                <div className="crop-card" key={mill.id}>
                  <div className="crop-card-header">
                    <label>{`Mill ${index + 1} — type of crop service`}
                      <select value={mill.cropTypes[0]} onChange={(event) => updateMillCropType(mill.id, 0, event.target.value)} required>
                        <option value="">Select crop</option>
                        {t.cropSuggestions.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
                      </select>
                    </label>
                  </div>

                  {mill.cropTypes.slice(1).map((crop, cropIndex) => (
                    <div className="crop-card-header" key={cropIndex}>
                      <label>{`Additional crop service`}
                        <select value={crop} onChange={(event) => updateMillCropType(mill.id, cropIndex + 1, event.target.value)} required>
                          <option value="">Select crop</option>
                          {t.cropSuggestions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <button type="button" className="remove-crop-button" onClick={() => removeMillCropType(mill.id, cropIndex + 1)} aria-label="Remove this crop service">×</button>
                    </div>
                  ))}

                  <button type="button" className="add-crop-button" onClick={() => addMillCropType(mill.id)}>
                    <span aria-hidden="true">+</span> Add another crop service
                  </button>

                  <div className="form-grid">
                    <label>GSTIN
                      <input
                        type="text"
                        placeholder="e.g. 22AAAAA0000A1Z5"
                        value={mill.gstin}
                        maxLength={15}
                        onChange={(event) => updateMillGstin(mill.id, event.target.value)}
                        required
                      />
                    </label>
                    <label>GSTIN document
                      <div className="doc-upload-box">
                        {mill.documentUrl ? (
                          <span className="doc-upload-filename">📄 Document uploaded — tap to replace</span>
                        ) : (
                          <span className="doc-upload-placeholder"><span className="photo-upload-icon">📄</span> Upload GSTIN certificate (PDF or image)</span>
                        )}
                        <input type="file" accept=".pdf,image/*" onChange={(event) => handleMillDocChange(mill.id, event)} />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
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
