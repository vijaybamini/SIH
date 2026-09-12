import { useEffect, useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
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
  return (
    <div className="profile-tooltip" role="menu" ref={tooltipRef} hidden={!visible}>
      {!profileComplete && (
        <>
          <p>{t.profileIncompleteMsg}</p>
          <button className="profile-tooltip-cta" onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </>
      )}
      <div className="profile-menu-list">
        <button className="menu-item" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
        <button className="menu-item" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
      </div>
    </div>
  )
}

export default function ServiceDashboard({ user, serviceProfile, language, setLanguage, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [showTopMenu, showTop, hideTop, wrapRef, tooltipRef] = useHoverMenu()
  const initials = (user.name || 'S').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'S'

  const mills = serviceProfile?.mills ?? []
  const pastServices = []

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand"><span className="brand-mark">✦</span>Farm<span>Direct</span></div>

        <nav className="dash-nav" aria-label={t.dashboardNavLabel}>
          <button className="active">{t.navDashboard}</button>
        </nav>

        <button className="dash-logout" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
      </aside>

      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <p className="dash-greeting-eyebrow">{t.dashboardLabel}</p>
            <h2 className="dash-greeting">{t.welcomeBack}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          </div>
          <div className="dash-topbar-actions">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="dash-avatar-wrap" ref={wrapRef} onMouseEnter={showTop}>
              <div className="dash-avatar" tabIndex={0} onClick={showTop} onFocus={showTop} onBlur={hideTop}>
                {initials}
                {!user.profileComplete && <span className="profile-alert" aria-label={t.profileIncompleteLabel}>!</span>}
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

        <div className="dash-grid dash-grid-reverse">
          <div className="dash-col-side">
            <h3>Profile details</h3>
            <div className="farmer-details-card">
              <div className="farmer-photo-wrap">
                {serviceProfile?.photo ? (
                  <img className="farmer-photo" src={serviceProfile.photo} alt="" />
                ) : (
                  <div className="farmer-photo farmer-photo-empty" aria-hidden="true">{initials}</div>
                )}
              </div>
              <div className="farmer-details-row">
                <span>{t.name}</span>
                <strong>{user.name || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.email}</span>
                <strong>{serviceProfile?.email || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.address}</span>
                <strong>{serviceProfile?.address || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>Crops serviced</span>
                <strong>{[...new Set(mills.flatMap((mill) => mill.cropTypes.filter(Boolean)))].join(', ') || '—'}</strong>
              </div>
            </div>
          </div>

          <div className="dash-col-main">
            <div className="section-heading-row">
              <h3>Your mills</h3>
              <button className="icon-add-button" onClick={onOpenCompleteProfile} aria-label={t.editProfile} title={t.editProfile}>+</button>
            </div>
            {mills.length === 0 ? (
              <div className="empty-card">
                <p>{user.profileComplete ? 'No mills added yet.' : 'Complete your profile to see your mills here.'}</p>
                {!user.profileComplete && <button className="button button-primary" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>}
              </div>
            ) : (
              <div className="crop-progress-list">
                {mills.map((mill, index) => (
                  <article className="crop-progress-card" key={mill.id}>
                    <div className="crop-progress-header">
                      <strong>{`Mill ${index + 1}`}</strong>
                      <span className="crop-status">{mill.gstin ? 'GSTIN on file' : 'GSTIN pending'}</span>
                    </div>
                    <div className="crop-meta-row">
                      <span>Crop services: <b>{mill.cropTypes.filter(Boolean).join(', ') || '—'}</b></span>
                    </div>
                    {mill.documentUrl && (
                      <div className="crop-meta-row">
                        <a href={mill.documentUrl} target="_blank" rel="noreferrer">📄 View GSTIN document</a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <h3>Past services</h3>
            {pastServices.length === 0 ? (
              <div className="empty-card"><p>No past services yet.</p></div>
            ) : (
              <div className="past-crop-list">
                {pastServices.map((service) => (
                  <article className="past-crop-card" key={service.id}>
                    <strong>{service.title}</strong>
                    <div className="past-crop-meta">
                      <span>{service.date}</span>
                    </div>
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
