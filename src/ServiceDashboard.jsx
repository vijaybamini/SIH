import { useEffect, useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import Logo from './Logo'
import { useTranslation } from './i18n'

const MENU_PROXIMITY_MARGIN = 28
const MENU_CLOSE_DELAY_MS = 300

function useHoverMenu() {
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)
  const wrapRef = useRef(null)
  const tooltipRef = useRef(null)

  function show() {
    clearTimeout(timer.current)
    setVisible(true)
  }
  function hide() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), MENU_CLOSE_DELAY_MS)
  }

  useEffect(() => {
    if (!visible) return undefined
    function cursorNear(event) {
      const wrap = wrapRef.current
      if (!wrap) return false
      const rects = [wrap.getBoundingClientRect()]
      const tooltip = tooltipRef.current
      if (tooltip && !tooltip.hidden) rects.push(tooltip.getBoundingClientRect())
      return rects.some((rect) =>
        event.clientX >= rect.left - MENU_PROXIMITY_MARGIN &&
        event.clientX <= rect.right + MENU_PROXIMITY_MARGIN &&
        event.clientY >= rect.top - MENU_PROXIMITY_MARGIN &&
        event.clientY <= rect.bottom + MENU_PROXIMITY_MARGIN
      )
    }
    function handleMouseMove(event) {
      clearTimeout(timer.current)
      if (cursorNear(event)) return
      timer.current = setTimeout(() => setVisible(false), MENU_CLOSE_DELAY_MS)
    }
    function handleClickOutside(event) {
      const wrap = wrapRef.current
      if (wrap && wrap.contains(event.target)) return
      const tooltip = tooltipRef.current
      if (tooltip && tooltip.contains(event.target)) return
      setVisible(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleClickOutside)
      clearTimeout(timer.current)
    }
  }, [visible])

  return [visible, show, hide, wrapRef, tooltipRef]
}

function ProfileMenu({ profileComplete, onOpenCompleteProfile, onLogout, tooltipRef, visible, t }) {
  if (!visible) return null
  return (
    <div ref={tooltipRef} role="menu" className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 shadow-lg shadow-brand-900/10">
      {!profileComplete && (
        <div className="mb-2 rounded-lg bg-brand-50 p-3">
          <p className="mb-2 text-xs text-brand-800">{t.profileIncompleteMsg}</p>
          <button className="text-xs font-bold text-brand-600 hover:text-brand-700" onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </div>
      )}
      <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-800 hover:bg-brand-50 hover:text-brand-600" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
      <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-800 hover:bg-brand-50 hover:text-brand-600" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
    </div>
  )
}

export default function ServiceDashboard({ user, serviceProfile, language, setLanguage, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [showTopMenu, showTop, hideTop, wrapRef, tooltipRef] = useHoverMenu()
  const initials = (user.name || 'S').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'S'

  const mills = serviceProfile?.mills ?? []
  const pastServices = []
  const cropsCovered = [...new Set(mills.flatMap((mill) => mill.cropTypes.filter(Boolean)))]
  const gstinCompliant = mills.filter((mill) => mill.gstin).length

  const stats = [
    ['Mills registered', mills.length],
    ['Crop types covered', cropsCovered.length],
    ['GSTIN on file', mills.length ? `${gstinCompliant}/${mills.length}` : '—'],
  ]

  return (
    <div className="flex min-h-screen bg-cream-200 font-sans text-[15px] leading-relaxed text-[var(--text-primary)]">
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#dcebc4] p-7">
        <div className="mb-9 px-2"><Logo /></div>

        <nav className="flex flex-col gap-1.5" aria-label={t.dashboardNavLabel}>
          <button className="rounded-xl bg-white px-4 py-3.5 text-left text-[16px] font-bold text-brand-900 shadow-sm">{t.navDashboard}</button>
        </nav>

        <button className="mt-auto flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-left text-[16px] font-medium text-[#4a5c40] hover:text-brand-900" onClick={onLogout}>
          <span aria-hidden="true">⤶</span> {t.logout}
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-9 pb-14 pt-8">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-400">{t.dashboardLabel}</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-brand-900">{t.welcomeBack}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          </div>
          <div className="flex items-center gap-3.5">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="relative" ref={wrapRef} onMouseEnter={showTop}>
              <div
                className="relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
                tabIndex={0}
                onClick={showTop}
                onFocus={showTop}
                onBlur={hideTop}
              >
                {initials}
                {!user.profileComplete && (
                  <span className="absolute -right-1 -top-1 flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 border-cream-300 bg-cream-300 text-sm font-extrabold text-brand-600" aria-label={t.profileIncompleteLabel}>!</span>
                )}
              </div>
              <ProfileMenu
                profileComplete={user.profileComplete}
                onOpenCompleteProfile={onOpenCompleteProfile}
                onLogout={onLogout}
                tooltipRef={tooltipRef}
                visible={showTopMenu}
                t={t}
              />
            </div>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-4">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</span>
              <strong className="mt-1 block font-display text-3xl font-bold text-brand-900">{value}</strong>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[340px_1fr]">
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-2xl font-bold text-brand-900">{t.profileDetails}</h3>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-brand-50 p-5">
              <div className="mb-4">
                {serviceProfile?.photo ? (
                  <img className="block h-[260px] w-full rounded-xl object-cover" src={serviceProfile.photo} alt="" />
                ) : (
                  <div className="flex h-[260px] items-center justify-center rounded-xl bg-brand-600 text-4xl font-extrabold text-white" aria-hidden="true">{initials}</div>
                )}
              </div>
              {[
                [t.name, user.name],
                [t.email, serviceProfile?.email],
                [t.address, serviceProfile?.address],
                [t.cropsServiced, cropsCovered.join(', ')],
              ].map(([label, value], i) => (
                <div key={label} className={`flex flex-col gap-1 py-3 ${i > 0 ? 'border-t border-brand-600/10' : 'pt-0'}`}>
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-400">{label}</span>
                  <strong className="text-lg text-brand-900">{value || '—'}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="font-display text-2xl font-bold text-brand-900">{t.yourMills}</h3>
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white hover:bg-brand-700" onClick={onOpenCompleteProfile} aria-label={t.editProfile} title={t.editProfile}>+</button>
            </div>
            {mills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
                <p className="mb-3.5 text-lg text-brand-900">{user.profileComplete ? t.noMillsYet : t.completeServicePrompt}</p>
                {!user.profileComplete && <button className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>}
              </div>
            ) : (
              <div className="grid gap-3.5">
                {mills.map((mill, index) => (
                  <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" key={mill.id}>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <strong className="text-base text-brand-900">{t.millNumber.replace('{n}', index + 1)}</strong>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${mill.gstin ? 'bg-brand-100 text-brand-700' : 'bg-cream-200 text-[var(--text-muted)]'}`}>
                        {mill.gstin ? t.gstinOnFile : t.gstinPending}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{t.cropServices}: <strong className="text-brand-900">{mill.cropTypes.filter(Boolean).join(', ') || '—'}</strong></p>
                    {mill.documentUrl && (
                      <p className="mt-2">
                        <a className="text-sm font-semibold text-brand-600 hover:text-brand-700" href={mill.documentUrl} target="_blank" rel="noreferrer">📄 {t.viewGstinDocument}</a>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}

            <h3 className="mb-3.5 mt-8 font-display text-2xl font-bold text-brand-900">{t.pastServices}</h3>
            {pastServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">{t.noPastServicesYet}</div>
            ) : (
              <div className="grid gap-3">
                {pastServices.map((service) => (
                  <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" key={service.id}>
                    <strong className="text-brand-900">{service.title}</strong>
                    <div className="mt-1 text-sm text-[var(--text-muted)]"><span>{service.date}</span></div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
