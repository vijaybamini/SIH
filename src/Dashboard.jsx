import { useRef, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'

const TOOLTIP_HOLD_MS = 2000

function useHoverMenu() {
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)
  function show() {
    clearTimeout(timer.current)
    setVisible(true)
  }
  function hide() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), TOOLTIP_HOLD_MS)
  }
  return [visible, show, hide]
}

function ProfileMenu({ profileComplete, onOpenCompleteProfile, onLogout, onOpen, onClose, visible, t }) {
  return (
    <div className="profile-tooltip" role="menu" onMouseEnter={onOpen} onMouseLeave={onClose} hidden={!visible}>
      {!profileComplete ? (
        <>
          <p>{t.profileIncompleteMsg}</p>
          <button onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </>
      ) : (
        <div className="profile-menu-list">
          <button className="menu-item" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
          <button className="menu-item" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
        </div>
      )}
    </div>
  )
}

function cropProgress(plantedDate, expectedHarvestDate) {
  if (!plantedDate || !expectedHarvestDate) return null
  const start = new Date(plantedDate).getTime()
  const end = new Date(expectedHarvestDate).getTime()
  const now = Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
  const pct = Math.round(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)))
  const daysLeft = Math.ceil((end - now) / 86400000)
  return { pct, daysLeft }
}

export default function Dashboard({ user, farmerProfile, language, setLanguage, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop] = useHoverMenu()
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'

  const navItems = [
    ['Dashboard', t.navDashboard], ['Analytics', t.navAnalytics], ['Fields', t.navFields],
    ['Harvesting', t.navHarvesting], ['Finances', t.navFinances], ['Settings', t.navSettings],
  ]

  const crops = farmerProfile?.crops?.filter((crop) => crop.name) ?? []

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand"><span className="brand-mark">✦</span>Farm<span>Direct</span></div>

        <nav className="dash-nav" aria-label="Dashboard navigation">
          {navItems.map(([key, label]) => (
            <button key={key} className={activeNav === key ? 'active' : ''} onClick={() => setActiveNav(key)}>{label}</button>
          ))}
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
            <div className="dash-avatar-wrap" onMouseEnter={showTop} onMouseLeave={hideTop}>
              <div className="dash-avatar" tabIndex={0} onFocus={showTop} onBlur={hideTop}>
                {initials}
                {!user.profileComplete && <span className="profile-alert" aria-label="Profile incomplete">!</span>}
              </div>
              <ProfileMenu
                profileComplete={user.profileComplete}
                onOpenCompleteProfile={onOpenCompleteProfile}
                onLogout={onLogout}
                onOpen={showTop}
                onClose={hideTop}
                visible={showTopMenu}
                t={t}
              />
            </div>
          </div>
        </header>

        <div className="dash-grid">
          <div className="dash-col-main">
            <h3>{t.currentCrops}</h3>
            {crops.length === 0 ? (
              <div className="empty-card">
                <p>{user.profileComplete ? t.noCropsYet : t.completeProfilePrompt}</p>
                {!user.profileComplete && <button className="button button-primary" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>}
              </div>
            ) : (
              <div className="crop-progress-list">
                {crops.map((crop) => {
                  const progress = crop.harvested ? null : cropProgress(crop.plantedDate, crop.expectedHarvestDate)
                  return (
                    <article className="crop-progress-card" key={crop.id}>
                      <div className="crop-progress-header">
                        <strong>{crop.name}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
                        {crop.harvested ? (
                          <span className="crop-status crop-status-done">{t.harvested}</span>
                        ) : progress ? (
                          <span className="crop-status">{progress.daysLeft > 0 ? t.harvestIn.replace('{n}', progress.daysLeft) : t.readyToHarvest}</span>
                        ) : null}
                      </div>
                      {!crop.harvested && progress && (
                        <div className="progress-track crop-progress-track">
                          <div className="progress-fill" style={{ width: `${progress.pct}%`, background: 'var(--accent)' }} />
                        </div>
                      )}
                      {!crop.harvested && progress && <span className="crop-progress-pct">{progress.pct}%</span>}
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="dash-col-side">
            <h3>{t.farmerDetails}</h3>
            <div className="farmer-details-card">
              <div className="farmer-details-row">
                <span>{t.name}</span>
                <strong>{user.name || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.locationLabel}</span>
                <strong>{farmerProfile?.cropLocation || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.cropsLabel}</span>
                <strong>{crops.length ? crops.map((crop) => crop.name).join(', ') : '—'}</strong>
              </div>
              {crops.length > 0 && (
                <div className="farmer-details-turnover">
                  <span>{t.turnoverLabel}</span>
                  <ul>
                    {crops.filter((crop) => crop.turnover).map((crop) => (
                      <li key={crop.id}><span>{crop.name}</span><b>{crop.turnover}</b></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
