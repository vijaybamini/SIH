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
      {!profileComplete && (
        <>
          <p>Your profile isn’t complete yet.</p>
          <button onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </>
      )}
      <div className="profile-menu-list">
        <button className="menu-item" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
        <button className="menu-item" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
      </div>
    </div>
  )
}

const SERVICE_TYPE_LABELS = { storage: 'Storage services', transportation: 'Transportation', both: 'Transportation + Storage' }

export default function LogisticsDashboard({ user, logisticsProfile, language, setLanguage, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop] = useHoverMenu()
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'
  const profileComplete = Boolean(logisticsProfile?.serviceType)

  const navItems = [
    ['Dashboard', 'Dashboard'],
    ['PastOrders', 'Past Orders'],
    ['PastServices', 'Past Services'],
  ]

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
            <p className="dash-greeting-eyebrow">DASHBOARD</p>
            <h2 className="dash-greeting">{t.welcomeBack}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          </div>
          <div className="dash-topbar-actions">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="dash-avatar-wrap" onMouseEnter={showTop} onMouseLeave={hideTop}>
              <div className="dash-avatar" tabIndex={0} onFocus={showTop} onBlur={hideTop}>
                {initials}
                {!profileComplete && <span className="profile-alert" aria-label="Profile incomplete">!</span>}
              </div>
              <ProfileMenu
                profileComplete={profileComplete}
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

        {activeNav === 'Dashboard' && (
          <div className="dash-grid">
            <div className="dash-col-main">
              <div className="section-heading-row">
                <h3>Overview</h3>
              </div>
              {!profileComplete ? (
                <div className="empty-card">
                  <p>Complete your profile to start receiving orders and service requests.</p>
                  <button className="button button-primary" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>
                </div>
              ) : (
                <>
                  <div className="empty-card">
                    <p>You're set up as a {SERVICE_TYPE_LABELS[logisticsProfile.serviceType]} provider. No activity yet.</p>
                  </div>

                  {(logisticsProfile.serviceType === 'transportation' || logisticsProfile.serviceType === 'both') && (
                    <div className="logistics-overview-block">
                      <h4>Fleet ({logisticsProfile.vehicles?.length || 0} vehicles)</h4>
                      {logisticsProfile.vehicles?.length ? (
                        logisticsProfile.vehicles.map((vehicle, index) => (
                          <div className="summary-crop-card" key={index}>
                            <strong>{vehicle.type || `Vehicle ${index + 1}`}</strong>
                            <div className="summary-grid">
                              <div><span>Capacity</span><strong>{vehicle.capacity ? `${vehicle.capacity} tonnes` : '—'}</strong></div>
                              <div><span>Registration</span><strong>{vehicle.registration || '—'}</strong></div>
                              <div><span>Location</span><strong>{vehicle.location || '—'}</strong></div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="panel-subtitle">No vehicles added yet.</p>
                      )}
                    </div>
                  )}

                  {(logisticsProfile.serviceType === 'storage' || logisticsProfile.serviceType === 'both') && (
                    <div className="logistics-overview-block">
                      <h4>Cold storage</h4>
                      <div className="summary-grid">
                        <div><span>Capacity</span><strong>{logisticsProfile.storage?.capacity ? `${logisticsProfile.storage.capacity} tonnes` : '—'}</strong></div>
                        <div><span>Location</span><strong>{logisticsProfile.storage?.location || '—'}</strong></div>
                        <div><span>Filled</span><strong>{logisticsProfile.storage?.fillPercentage !== '' && logisticsProfile.storage?.fillPercentage != null ? `${logisticsProfile.storage.fillPercentage}%` : '—'}</strong></div>
                        <div><span>Remaining</span><strong>{logisticsProfile.storage?.fillPercentage !== '' && logisticsProfile.storage?.fillPercentage != null ? `${Math.max(0, 100 - (Number(logisticsProfile.storage.fillPercentage) || 0))}%` : '—'}</strong></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="dash-col-side">
              <h3>Provider details</h3>
              <div className="farmer-details-card">
                <div className="farmer-photo-wrap">
                  <div className="farmer-photo farmer-photo-empty" aria-hidden="true">{initials}</div>
                </div>
                <div className="farmer-details-row">
                  <span>{t.name}</span>
                  <strong>{user.name || '—'}</strong>
                </div>
                <div className="farmer-details-row">
                  <span>Service type</span>
                  <strong>{profileComplete ? SERVICE_TYPE_LABELS[logisticsProfile.serviceType] : '—'}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === 'PastOrders' && (
          <div className="dash-grid">
            <div className="dash-col-main">
              <div className="section-heading-row"><h3>Past Orders</h3></div>
              <div className="empty-card"><p>No past orders yet.</p></div>
            </div>
          </div>
        )}

        {activeNav === 'PastServices' && (
          <div className="dash-grid">
            <div className="dash-col-main">
              <div className="section-heading-row"><h3>Past Services</h3></div>
              <div className="empty-card"><p>No past services yet.</p></div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
