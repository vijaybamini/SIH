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

export default function LogisticsDashboard({ user, logisticsProfile, language, setLanguage, chosenSection, onChooseSection, onSelectSection, onOpenCompleteProfile, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop] = useHoverMenu()
  const [picked, setPicked] = useState(null)
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'

  const navItems = [
    ['Dashboard', t.navDashboard], ['Analytics', t.navAnalytics], ['Finances', t.navFinances], ['Settings', t.navSettings],
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
          {chosenSection && (
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
          )}
        </header>

        <div className="dash-grid dash-grid-reverse">
          <div className="dash-col-side">
            <h3>Provider details</h3>
            <div className="farmer-details-card">
              <div className="farmer-photo-wrap">
                {logisticsProfile?.photo ? (
                  <img className="farmer-photo" src={logisticsProfile.photo} alt="" />
                ) : (
                  <div className="farmer-photo farmer-photo-empty" aria-hidden="true">{initials}</div>
                )}
              </div>
              <div className="farmer-details-row">
                <span>{t.name}</span>
                <strong>{profile?.name || user.name || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.phone}</span>
                <strong>{profile?.phone || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>{t.address}</span>
                <strong>{profile?.address || '—'}</strong>
              </div>
              <div className="farmer-details-row">
                <span>Crops</span>
                <strong>{(profile?.crops || []).filter(Boolean).join(', ') || '—'}</strong>
              </div>
            </div>
          </div>

          <div className="dash-col-main">
            {!chosenSection ? (
              <div className="section-choice">
                <h2 className="dash-greeting" style={{ marginBottom: 10 }}>{t.chooseOneSection}</h2>
                <p className="panel-subtitle">{t.chooseOneSub}</p>

                <div className="choose-section-grid">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      className={`choose-section-card ${picked === section.id ? 'selected' : ''}`}
                      onClick={() => setPicked(section.id)}
                    >
                      <span className="choose-section-icon" aria-hidden="true">{section.icon}</span>
                      <strong>{section.title}</strong>
                      <small>{section.desc}</small>
                      <span className={`choose-section-radio ${picked === section.id ? 'checked' : ''}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>

                <button className="button button-primary section-select-confirm" disabled={!picked} onClick={() => { if (picked) onChooseSection(picked) }}>
                  {t.continueWith} {pickedTitle || '…'}
                </button>
              </div>
            ) : (
              <>
                <p className="eyebrow">{t.howRegister}</p>
                <h2 className="dash-greeting" style={{ marginBottom: 10 }}>{t.chooseSection}</h2>
                <p className="panel-subtitle">{t.chooseSectionSub}</p>

                <div className="choose-section-grid">
                  {sections.map((section) => {
                    const isOther = section.id !== chosenSection
                    const notAdded = isOther && !section.complete
                    const addLabel = `${t.addLabel} ${section.title}`
                    return (
                      <button
                        key={section.id}
                        className={`choose-section-card ${isOther ? 'section-card-secondary' : 'section-card-primary'} ${notAdded ? 'section-card-add' : ''}`}
                        onClick={() => onSelectSection(section.id)}
                      >
                        <span className="choose-section-icon" aria-hidden="true">{section.icon}</span>
                        <strong>{notAdded ? addLabel : section.title}</strong>
                        <small>{section.desc}</small>
                        <span className="choose-section-incomplete">
                          {notAdded ? `${addLabel} →` : `${section.complete ? t.viewProfile : t.completeProfile} →`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}