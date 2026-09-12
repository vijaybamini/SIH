import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveFarmerData } from './api/farmer'

const cropSuggestions = [
  'Rice', 'Wheat', 'Maize', 'Bajra', 'Jowar', 'Sugarcane', 'Cotton', 'Groundnut',
  'Soybean', 'Mustard', 'Chickpea (Gram)', 'Pigeon Pea (Tur)', 'Green Gram (Moong)',
  'Black Gram (Urad)', 'Potato', 'Onion', 'Tomato', 'Banana', 'Mango', 'Turmeric',
  'Chilli', 'Coconut', 'Tea', 'Coffee', 'Jute', 'Barley', 'Sunflower', 'Sesame',
]

let cropIdCounter = 1

function emptyCrop() {
  cropIdCounter += 1
  return { id: `new-${Date.now()}-${cropIdCounter}`, name: '', harvested: null, turnover: '', specificType: '', plantedDate: '', expectedHarvestDate: '' }
}

export default function CompleteProfileFarmer({ userId, onBack, onComplete, initialData, language, setLanguage }) {
  const t = useTranslation(language)
  const steps = [t.stepProfile, t.stepCropDetails, t.stepBankDetails]
  const [step, setStep] = useState(0)
  const [unlockedStep, setUnlockedStep] = useState(0)
  const formRef = useRef(null)

  const [areaOfLand, setAreaOfLand] = useState(initialData?.areaOfLand || '')
  const [surveyNumber, setSurveyNumber] = useState(initialData?.surveyNumber || '')
  const [aadhaarNumber, setAadhaarNumber] = useState(initialData?.aadhaarNumber || '')
  const [cropLocation, setCropLocation] = useState(initialData?.cropLocation || '')

  const [crops, setCrops] = useState(initialData?.crops?.length ? initialData.crops : [emptyCrop()])

  const [accountHolderName, setAccountHolderName] = useState(initialData?.bank?.accountHolderName || '')
  const [accountNumber, setAccountNumber] = useState(initialData?.bank?.accountNumber || '')
  const [ifsc, setIfsc] = useState(initialData?.bank?.ifsc || '')
  const [branch, setBranch] = useState(initialData?.bank?.branch || '')
  const [ifscStatus, setIfscStatus] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function updateCrop(id, field, value) {
    setCrops((current) => current.map((crop) => (crop.id === id ? { ...crop, [field]: value } : crop)))
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

  function goNext() {
    if (formRef.current && !formRef.current.reportValidity()) return
    setUnlockedStep((current) => Math.max(current, step + 1))
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function goToStep(index) {
    if (index <= unlockedStep) setStep(index)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    setIsSaving(true)
    try {
      const savedData = await saveFarmerData(userId, {
        areaOfLand,
        surveyNumber,
        aadhaarNumber,
        cropLocation,
        crops,
        bank: { accountHolderName, accountNumber, ifsc, branch },
      })
      onComplete(savedData)
    } catch (error) {
      setSaveError(error.message || 'Could not save your profile. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>
        <p className="eyebrow">COMPLETE YOUR PROFILE</p>
        <h2>{t.completeYourProfileTitle}</h2>
        <p className="panel-subtitle">{t.completeYourProfileSubtitle}</p>

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
            <div className="form-grid">
              <label>{t.areaOfLand}<input type="number" step="0.01" min="0" placeholder="e.g. 2.5" value={areaOfLand} onChange={(event) => setAreaOfLand(event.target.value)} required /></label>
              <label>{t.surveyNumber}<input type="text" placeholder="Enter the land survey number" value={surveyNumber} onChange={(event) => setSurveyNumber(event.target.value)} required /></label>
              <label>{t.aadhaarNumber}<input type="text" placeholder="Enter 12-digit Aadhaar number" value={aadhaarNumber} onChange={(event) => setAadhaarNumber(event.target.value)} required /></label>
              <label>{t.locationOfCrop}<input type="text" placeholder="Village, district, state" value={cropLocation} onChange={(event) => setCropLocation(event.target.value)} required /></label>
            </div>
          )}

          {step === 1 && (
            <div className="crop-section">
              <datalist id="crop-suggestions">
                {cropSuggestions.map((name) => <option value={name} key={name} />)}
              </datalist>

              {crops.map((crop, index) => (
                <div className="crop-card" key={crop.id}>
                  <div className="crop-card-header">
                    <label>{`Crop ${index + 1} ${t.cropNameLabel}`}
                      <input
                        type="text"
                        list="crop-suggestions"
                        placeholder="e.g. Rice"
                        value={crop.name}
                        onChange={(event) => updateCrop(crop.id, 'name', event.target.value)}
                        required
                      />
                    </label>
                    {crops.length > 1 && (
                      <button type="button" className="remove-crop-button" onClick={() => removeCrop(crop.id)} aria-label="Remove this crop">×</button>
                    )}
                  </div>

                  {crop.name && (
                    <>
                      <div className="form-grid crop-date-grid">
                        <label>{t.datePlanted}<input type="date" value={crop.plantedDate} onChange={(event) => updateCrop(crop.id, 'plantedDate', event.target.value)} required /></label>
                        <label>{t.expectedHarvestDate}<input type="date" value={crop.expectedHarvestDate} onChange={(event) => updateCrop(crop.id, 'expectedHarvestDate', event.target.value)} required /></label>
                      </div>

                      <div className="harvested-toggle">
                        <span>{t.harvestedQuestion}</span>
                        <div className="toggle-buttons">
                          <button type="button" className={crop.harvested === true ? 'selected' : ''} onClick={() => updateCrop(crop.id, 'harvested', true)}>{t.yes}</button>
                          <button type="button" className={crop.harvested === false ? 'selected' : ''} onClick={() => updateCrop(crop.id, 'harvested', false)}>{t.no}</button>
                        </div>
                      </div>

                      {crop.harvested !== null && (
                        <label>{crop.harvested ? t.turnover : t.expectedTurnover}
                          <input
                            type="text"
                            placeholder="e.g. ₹1,50,000"
                            value={crop.turnover}
                            onChange={(event) => updateCrop(crop.id, 'turnover', event.target.value)}
                            required
                          />
                        </label>
                      )}

                      <label>{t.specificTypeOfCrop}
                        <input
                          type="text"
                          list="crop-suggestions"
                          placeholder="Start typing… e.g. Basmati rice"
                          value={crop.specificType}
                          onChange={(event) => updateCrop(crop.id, 'specificType', event.target.value)}
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
          )}

          {step === 2 && (
            <div className="form-grid">
              <label>{t.accountHolderName}<input type="text" placeholder="Name as per bank account" value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} required /></label>
              <label>{t.accountNumber}<input type="text" placeholder="Enter account number" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} required /></label>
              <label>{t.ifscCode}
                <input type="text" placeholder="e.g. SBIN0001234" value={ifsc} onChange={handleIfscChange} maxLength={11} required />
                {ifscStatus === 'loading' && <small className="ifsc-hint">Looking up branch…</small>}
                {ifscStatus === 'found' && <small className="ifsc-hint ifsc-hint-ok">Branch auto-filled ✓</small>}
                {ifscStatus === 'notfound' && <small className="ifsc-hint ifsc-hint-warn">Couldn’t find this IFSC — enter branch manually.</small>}
              </label>
              <label>{t.branch}
                <input type="text" placeholder="Branch name" value={branch} onChange={(event) => setBranch(event.target.value)} required />
              </label>
            </div>
          )}

          <div className="profile-actions">
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            {step > 0 && <button type="button" className="button button-quiet" onClick={() => setStep(step - 1)}>{t.back}</button>}
            {step < steps.length - 1
              ? <button type="button" className="button button-primary" onClick={goNext}>{t.next}</button>
              : <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? 'Saving…' : t.saveFinish}</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
