import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveLogisticsData } from './api/logistics'

export default function CompleteProfileLogistics({ userId, onBack, onComplete, initialData, language, setLanguage }) {
  const t = useTranslation(language)
  const formRef = useRef(null)
  const [profile, setProfile] = useState({
    name: initialData?.profile?.name || '',
    aadhaarNumber: initialData?.profile?.aadhaarNumber || '',
    phone: initialData?.profile?.phone || '',
    address: initialData?.profile?.address || '',
    crops: initialData?.profile?.crops?.length ? initialData.profile.crops : [''],
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
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToLogistics}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <p className="eyebrow" style={{ marginBottom: 6 }}>{t.stepProfile}</p>
        <h2>{t.editProfile}</h2>
        <p className="panel-subtitle">{t.basicDetails}</p>

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

          <div className="profile-actions">
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
          </div>
        </form>
      </div>
    </div>
  )
}