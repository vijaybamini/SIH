import { useEffect, useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import NotificationBell from './NotificationBell'
import Logo from './Logo'
import MyJobsPanel from './MyJobsPanel'
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
      {!profileComplete ? (
        <div className="mb-2 rounded-lg bg-brand-50 p-3">
          <p className="mb-2 text-xs text-brand-800">{t.profileIncompleteMsg}</p>
          <button className="text-xs font-bold text-brand-600 hover:text-brand-700" onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </div>
      ) : (
        <>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-800 hover:bg-brand-50 hover:text-brand-600" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-800 hover:bg-brand-50 hover:text-brand-600" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
        </>
      )}
    </div>
  )
}

export default function LogisticsDashboard({ user, logisticsProfile, language, setLanguage, chosenSection, onChooseSection, onSelectSection, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop, wrapRef, tooltipRef] = useHoverMenu()
  const [picked, setPicked] = useState(null)
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'

  const navItems = [
    ['Dashboard', t.navDashboard],
    ['Jobs', 'My Jobs'],
    ['Transport', t.stepTransportation],
    ['Storage', t.stepInventory],
    ['Profile', t.stepProfile],
  ]

  const profile = logisticsProfile?.profile
  const profileOK = Boolean(profile?.name && profile?.aadhaarNumber && profile?.phone && profile?.address)
  const transportOK = profileOK && (logisticsProfile?.vehicles || []).some((vehicle) => vehicle.type && vehicle.registrationNumber)
  const inventoryState = logisticsProfile?.inventory
  const inventoryOK = Boolean(inventoryState?.type && inventoryState?.location && inventoryState?.capacity !== '' && inventoryState?.fill !== '')

  const sections = [
    {
      id: 'transport',
      icon: '🚚',
      title: t.transportCard,
      desc: t.transportCardDesc,
      complete: transportOK,
    },
    {
      id: 'inventory',
      icon: '❄️',
      title: t.inventoryCard,
      desc: t.inventoryCardDesc,
      complete: inventoryOK,
    },
  ]

  const pickedTitle = picked ? sections.find((section) => section.id === picked)?.title : ''

  function goToNav(key) {
    setActiveNav(key)
    if (key === 'Transport') onSelectSection('transport')
    if (key === 'Storage') onSelectSection('inventory')
    if (key === 'Profile') onSelectSection('profile')
  }

  return (
    <div className="flex min-h-screen bg-cream-200 font-sans text-[15px] leading-relaxed text-[var(--text-primary)]">
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#dcebc4] p-7">
        <div className="mb-9 px-2"><Logo /></div>

        <nav className="flex flex-col gap-1.5" aria-label={t.dashboardNavLabel}>
          {navItems.map(([key, label]) => (
            <button
              key={key}
              className={`rounded-xl px-4 py-3.5 text-left text-[16px] font-medium transition-colors ${
                activeNav === key ? 'bg-white font-bold text-brand-900 shadow-sm' : 'text-[#4a5c40] hover:bg-white/55 hover:text-brand-900'
              }`}
              onClick={() => goToNav(key)}
            >{label}</button>
          ))}
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
          {chosenSection && (
            <div className="flex items-center gap-3.5">
              <NotificationBell userId={user.id} onViewTripOffer={() => goToNav('Transport')} />
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
                  {!user.profileComplete && <span className="absolute -right-1 -top-1 flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 border-cream-300 bg-cream-300 text-sm font-extrabold text-brand-600" aria-label={t.profileIncompleteLabel}>!</span>}
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
          )}
        </header>

        <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[340px_1fr]">
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-2xl font-bold text-brand-900">{t.providerDetails}</h3>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-brand-50 p-5">
              <div className="mb-4">
                {logisticsProfile?.photo ? (
                  <img className="block h-[260px] w-full rounded-xl object-cover" src={logisticsProfile.photo} alt="" />
                ) : (
                  <div className="flex h-[260px] items-center justify-center rounded-xl bg-brand-600 text-4xl font-extrabold text-white" aria-hidden="true">{initials}</div>
                )}
              </div>
              {[
                [t.name, profile?.name || user.name],
                [t.phone, profile?.phone],
                [t.address, profile?.address],
                [t.cropsLabel, (profile?.crops || []).filter(Boolean).join(', ')],
              ].map(([label, value], i) => (
                <div key={label} className={`flex flex-col gap-1 py-3 ${i > 0 ? 'border-t border-brand-600/10' : 'pt-0'}`}>
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-400">{label}</span>
                  <strong className="text-lg text-brand-900">{value || '—'}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
        {activeNav === 'Jobs' ? (
          <>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-400">LOGISTICS</p>
            <h2 className="mb-2 font-display text-2xl font-bold text-brand-900">My Jobs</h2>
            <p className="mb-6 text-sm text-[var(--text-muted)]">Jobs you've accepted from the notification bell, and their delivery status.</p>
            <MyJobsPanel userId={user.id} />
          </>
        ) : !chosenSection ? (
          <div>
            <h2 className="mb-2 font-display text-2xl font-bold text-brand-900">{t.chooseOneSection}</h2>
            <p className="mb-7 text-sm text-[var(--text-muted)]">{t.chooseOneSub}</p>

            <div className="mb-7 grid gap-5 sm:grid-cols-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  className={`relative flex flex-col items-start gap-2 rounded-2xl border-2 p-6 text-left transition-all ${
                    picked === section.id ? 'border-brand-600 bg-brand-50' : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-brand-300'
                  }`}
                  onClick={() => setPicked(section.id)}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden="true">{section.icon}</span>
                  <strong className="font-display text-lg text-brand-900">{section.title}</strong>
                  <small className="text-sm text-[var(--text-muted)]">{section.desc}</small>
                  <span className={`absolute right-5 top-5 h-5 w-5 rounded-full border-2 ${picked === section.id ? 'border-brand-600 bg-brand-600' : 'border-[var(--border-subtle)]'}`} aria-hidden="true" />
                </button>
              ))}
            </div>

            <button className="rounded-lg bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!picked} onClick={() => { if (picked) onChooseSection(picked) }}>
              {t.continueWith} {pickedTitle || '…'}
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-400">{t.howRegister}</p>
            <h2 className="mb-2 font-display text-2xl font-bold text-brand-900">{t.chooseSection}</h2>
            <p className="mb-7 text-sm text-[var(--text-muted)]">{t.chooseSectionSub}</p>

            <div className="grid gap-5 sm:grid-cols-2">
              {sections.map((section) => {
                const isOther = section.id !== chosenSection
                const notAdded = isOther && !section.complete
                const addLabel = `${t.addLabel} ${section.title}`
                return (
                  <button
                    key={section.id}
                    className={`flex flex-col items-start gap-2 rounded-2xl border p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/[0.08] ${
                      isOther ? 'border-[var(--border-subtle)] bg-cream-100' : 'border-brand-300 bg-[var(--surface-raised)]'
                    }`}
                    onClick={() => onSelectSection(section.id)}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden="true">{section.icon}</span>
                    <strong className="font-display text-lg text-brand-900">{notAdded ? addLabel : section.title}</strong>
                    <small className="text-sm text-[var(--text-muted)]">{section.desc}</small>
                    <span className="mt-1 text-sm font-semibold text-brand-600">
                      {notAdded ? `${addLabel} →` : `${section.complete ? t.viewProfile : t.completeProfile} →`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
          </div>
        </div>
      </main>
    </div>
  )
}
