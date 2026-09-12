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

export default function Dashboard({ user, farmerProfile, language, setLanguage, onOpenCompleteProfile, onQuickAddCrop, onMarkCropHarvested, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop] = useHoverMenu()
  const [dismissedIds, setDismissedIds] = useState([])
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'

  const navItems = [
    ['Dashboard', t.navDashboard], ['Analytics', t.navAnalytics], ['Fields', t.navFields],
    ['Harvesting', t.navHarvesting], ['Finances', t.navFinances], ['Settings', t.navSettings],
  ]

  const allCrops = farmerProfile?.crops?.filter((crop) => crop.name) ?? []
  const crops = allCrops.filter((crop) => !crop.harvested)
  const pastCrops = allCrops.filter((crop) => crop.harvested)

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand"><span className="brand-mark">✦</span>Farm<span>Direct</span></div>

        <nav className="dash-nav" aria-label={t.dashboardNavLabel}>
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
                {!user.profileComplete && <span className="profile-alert" aria-label={t.profileIncompleteLabel}>!</span>}
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
            <div className="section-heading-row">
              <h3>{t.currentCrops}</h3>
              <button className="icon-add-button" onClick={onQuickAddCrop} aria-label={t.addAnotherCrop} title={t.addAnotherCrop}>+</button>
            </div>
            {crops.length === 0 ? (
              <div className="empty-card">
                <p>{user.profileComplete ? t.noCropsYet : t.completeProfilePrompt}</p>
                {!user.profileComplete && <button className="button button-primary" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>}
              </div>
            ) : (
              <div className="crop-progress-list">
                {crops.map((crop) => {
                  const progress = cropProgress(crop.plantedDate, crop.expectedHarvestDate)
                  const showHarvestPrompt = progress && progress.pct >= 100 && !dismissedIds.includes(crop.id)
                  return (
                    <article className="crop-progress-card" key={crop.id}>
                      <div className="crop-progress-header">
                        <strong>{crop.name}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
                        {progress && (
                          <span className="crop-status">{progress.daysLeft > 0 ? t.harvestIn.replace('{n}', progress.daysLeft) : t.readyToHarvest}</span>
                        )}
                      </div>
                      <div className="crop-progress-row">
                        <div className="crop-progress-bar-wrap">
                          {progress ? (
                            <>
                              <div className="progress-track crop-progress-track">
                                <div className="progress-fill" style={{ width: `${progress.pct}%`, background: '#000' }} />
                              </div>
                              <span className="crop-progress-pct">{progress.pct}%</span>
                            </>
                          ) : (
                            <div className="progress-track crop-progress-track" aria-hidden="true" />
                          )}
                        </div>
                        <div className="crop-turnover">
                          <span>{t.turnoverLabel}</span>
                          <strong>{crop.turnover ? `${crop.turnover} ${t.quintals}` : '—'}</strong>
                        </div>
                      </div>
                      <div className="crop-meta-row">
                        <span>{t.landLabel}: <b>{crop.landUsed ? `${crop.landUsed} ${t.acres}` : '—'}</b></span>
                      </div>
                      {showHarvestPrompt && (
                        <div className="harvest-confirm-row">
                          <span>{t.didYouHarvest}</span>
                          <div className="toggle-buttons">
                            <button type="button" onClick={() => onMarkCropHarvested(crop.id)}>{t.yes}</button>
                            <button type="button" onClick={() => setDismissedIds((current) => [...current, crop.id])}>{t.no}</button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            <h3>{t.pastCrops}</h3>
            {pastCrops.length === 0 ? (
              <div className="empty-card">
                <p>{t.noPastCropsYet}</p>
              </div>
            ) : (
              <div className="past-crop-list">
                {pastCrops.map((crop) => (
                  <article className="past-crop-card" key={crop.id}>
                    <strong>{crop.name}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
                    <div className="past-crop-meta">
                      <span>{t.turnoverLabel}: <b>{crop.turnover ? `${crop.turnover} ${t.quintals}` : '—'}</b></span>
                      <span>{t.landLabel}: <b>{crop.landUsed ? `${crop.landUsed} ${t.acres}` : '—'}</b></span>
                      <span>{t.dateHarvested}: <b>{crop.expectedHarvestDate || '—'}</b></span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="dash-col-side">
            <h3>{t.farmerDetails}</h3>
            <div className="farmer-details-card">
              <div className="farmer-photo-wrap">
                {farmerProfile?.photo ? (
                  <img className="farmer-photo" src={farmerProfile.photo} alt="" />
                ) : (
                  <div className="farmer-photo farmer-photo-empty" aria-hidden="true">{initials}</div>
                )}
              </div>
              <div className="farmer-details-row">
                <span>{t.name}</span>
                <strong>{user.name || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.locationLabel}</span>
                <strong>{farmerProfile?.cropLocation || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.farmSize}</span>
                <strong>{farmerProfile?.areaOfLand ? `${farmerProfile.areaOfLand} ${t.acres}` : '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.joined}</span>
                <strong>{user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : '—'}</strong>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
