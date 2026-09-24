import { useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { saveServiceData } from './api/service'

let millIdCounter = 1

function emptyMill() {
  millIdCounter += 1
  return { id: `new-${Date.now()}-${millIdCounter}`, cropTypes: [''], gstin: '', documentUrl: null, documentFile: null }
}

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-400'

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
    const cropsCovered = [...new Set(mills.flatMap((mill) => mill.cropTypes.filter(Boolean)))]
    const gstinCompliant = mills.filter((mill) => mill.gstin).length
    const stats = [
      ['Mills registered', mills.length],
      ['Crop types covered', cropsCovered.length],
      ['GSTIN on file', mills.length ? `${gstinCompliant}/${mills.length}` : '—'],
    ]

    return (
      <div className="min-h-screen bg-cream-200 font-sans text-[15px] text-[var(--text-primary)]">
        <div className="mx-auto max-w-[840px] px-6 py-10">
          <div className="mb-6 flex items-center justify-between gap-4">
            <button className="text-sm font-semibold text-brand-700 hover:text-brand-600" onClick={onBack}>{t.backToDashboard}</button>
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          <div className="mb-7 flex flex-wrap items-center gap-5">
            {photo ? (
              <img className="h-20 w-20 shrink-0 rounded-full object-cover" src={photo} alt="" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xl font-extrabold text-white" aria-hidden="true">{(name || 'S')[0]}</div>
            )}
            <div className="flex-1">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-400">{t.yourProfileEyebrow}</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-brand-900">{t.serviceProviderProfileTitle}</h2>
            </div>
            <button className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => setMode('edit')}>{t.editProfile}</button>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</span>
                <strong className="mt-1 block font-display text-3xl font-bold text-brand-900">{value}</strong>
              </div>
            ))}
          </div>

          <section className="mb-7">
            <h3 className="mb-3.5 font-display text-lg font-bold text-brand-900">{t.stepProfile}</h3>
            <div className="grid gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 sm:grid-cols-2">
              {[[t.name, name], [t.phone, phone], [t.email, email], [t.address, address]].map(([label, value]) => (
                <div key={label}>
                  <span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{label}</span>
                  <strong className="text-base text-brand-900">{value || '—'}</strong>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3.5 font-display text-lg font-bold text-brand-900">{t.millDetailsWord}</h3>
            {mills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">{t.noMillsYet}</div>
            ) : (
              <div className="grid gap-4">
                {mills.map((mill, index) => (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" key={mill.id}>
                    <strong className="mb-3 block text-base text-brand-900">{t.millNumber.replace('{n}', index + 1)}</strong>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div><span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{t.cropServices}</span><strong className="text-brand-900">{mill.cropTypes.filter(Boolean).join(', ') || '—'}</strong></div>
                      <div><span className="block text-xs font-bold uppercase tracking-wide text-brand-400">GSTIN</span><strong className="text-brand-900">{mill.gstin || '—'}</strong></div>
                    </div>
                    {mill.documentUrl && (
                      <p className="mt-3"><a className="text-sm font-semibold text-brand-600 hover:text-brand-700" href={mill.documentUrl} target="_blank" rel="noreferrer">📄 {t.viewUploadedDocument}</a></p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-200 font-sans text-[15px] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button className="text-sm font-semibold text-brand-700 hover:text-brand-600" onClick={() => (initialData ? setMode('summary') : onBack())}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-400">{t.completeProfileEyebrow}</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-brand-900">{t.serviceProviderProfileDetailsTitle}</h2>
        <p className="mt-2 mb-5 text-[15px] text-[var(--text-muted)]">{t.serviceIntroSub}</p>

        <div className="mb-7 flex items-center gap-3.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${completionPercent}%` }} />
          </div>
          <span className="shrink-0 text-sm font-bold text-brand-700">{t.percentComplete.replace('{n}', completionPercent)}</span>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
          <div>
            <h3 className="mb-4 font-display text-lg font-bold text-brand-900">{t.stepProfile}</h3>
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>{t.name}<input className={inputClass} type="text" placeholder={t.namePlaceholder} value={name} onChange={(event) => setName(event.target.value)} required /></label>
              <label className={labelClass}>{t.phone}<input className={inputClass} type="tel" placeholder={t.phonePlaceholder} value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
              <label className={labelClass}>{t.email} (optional)<input className={inputClass} type="email" placeholder={t.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className={`${labelClass} sm:col-span-2`}>{t.address}<textarea className={`${inputClass} min-h-[90px] resize-y`} placeholder={t.addressPlaceholder} value={address} onChange={(event) => setAddress(event.target.value.toUpperCase())} required /></label>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-6">
            <h3 className="mb-4 font-display text-lg font-bold text-brand-900">{t.millDetailsWord}</h3>
            <label className={`${labelClass} max-w-[260px]`}>{t.howManyMills}
              <input
                className={inputClass}
                type="number"
                min="1"
                max="20"
                step="1"
                placeholder={t.millCountPlaceholder}
                value={millCount}
                onChange={(event) => updateMillCount(event.target.value)}
                required
              />
            </label>

            {mills.length > 0 && (
              <div className="mt-5 grid gap-5">
                {mills.map((mill, index) => (
                  <div className="rounded-2xl bg-cream-100 p-5" key={mill.id}>
                    <div className="grid gap-3">
                      <label className={labelClass}>{t.millCropServiceInline.replace('{n}', index + 1)}
                        <select className={inputClass} value={mill.cropTypes[0]} onChange={(event) => updateMillCropType(mill.id, 0, event.target.value)} required>
                          <option value="">{t.selectCrop}</option>
                          {t.cropSuggestions.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
                        </select>
                      </label>

                      {mill.cropTypes.slice(1).map((crop, cropIndex) => (
                        <div className="flex items-end gap-2.5" key={cropIndex}>
                          <label className={`${labelClass} flex-1`}>{t.additionalCropService}
                            <select className={inputClass} value={crop} onChange={(event) => updateMillCropType(mill.id, cropIndex + 1, event.target.value)} required>
                              <option value="">{t.selectCrop}</option>
                              {t.cropSuggestions.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </label>
                          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-[var(--text-muted)] hover:bg-white hover:text-[var(--color-error-ink)]" onClick={() => removeMillCropType(mill.id, cropIndex + 1)} aria-label={t.removeCropServiceLabel}>×</button>
                        </div>
                      ))}

                      <button type="button" className="justify-self-start text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => addMillCropType(mill.id)}>
                        + {t.addAnotherCropService}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className={labelClass}>GSTIN
                        <input
                          className={inputClass}
                          type="text"
                          placeholder={t.gstinPlaceholder}
                          value={mill.gstin}
                          maxLength={15}
                          onChange={(event) => updateMillGstin(mill.id, event.target.value)}
                          required
                        />
                      </label>
                      <label className={labelClass}>{t.gstinDocument}
                        <div className="relative flex h-[46px] items-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 text-sm">
                          {mill.documentUrl ? (
                            <span className="truncate text-brand-700">📄 {t.documentUploadedReplace}</span>
                          ) : (
                            <span className="truncate text-[var(--text-muted)]">📄 {t.uploadGstinCertificate}</span>
                          )}
                          <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept=".pdf,image/*" onChange={(event) => handleMillDocChange(mill.id, event)} />
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-[var(--border-subtle)] pt-5">
            {saveError && <p className="flex-1 rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{saveError}</p>}
            <button type="submit" className="ml-auto rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" disabled={isSaving}>{isSaving ? t.savingButton : t.saveFinish}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
