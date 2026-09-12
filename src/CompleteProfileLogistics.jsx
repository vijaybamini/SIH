import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'

const SERVICE_TYPES = [
  { key: 'storage', icon: '🏬', title: 'Storage services', description: 'Cold storage, warehousing and inventory management for produce.' },
  { key: 'transportation', icon: '🚚', title: 'Transportation', description: 'Moving produce between farms, storage and buyers with your fleet.' },
]

export default function CompleteProfileLogistics({ onBack, onComplete, language, setLanguage }) {
  const t = useTranslation(language)

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <div className="profile-page-topbar">
          <button className="back-button" onClick={onBack}>{t.backToDashboard}</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        <p className="eyebrow">COMPLETE YOUR PROFILE</p>
        <h2>What service do you provide?</h2>
        <p className="panel-subtitle">Choose the option that best describes your business. You can add more details next.</p>

        <div className="role-grid">
          {SERVICE_TYPES.map((item) => (
            <button className="role-card" key={item.key} onClick={() => onComplete(item.key)}>
              <span className="role-icon" aria-hidden="true">{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
              <span className="role-arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
