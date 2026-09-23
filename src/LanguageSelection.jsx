import { SELECTABLE_LANGUAGES, languageNames, languageSelectionCopy } from './i18n'
import Logo from './Logo'

export default function LanguageSelection({ onSelect }) {
  const copy = languageSelectionCopy.en

  return (
    <div className="language-screen">
      <div className="language-panel">
        <Logo href="#home" label="F2C home" />

        <h1 className="language-heading">{copy.title}</h1>
        <p className="language-subtitle">{copy.subtitle}</p>

        <div className="language-grid">
          {SELECTABLE_LANGUAGES.map((code) => (
            <button
              key={code}
              className="language-card"
              type="button"
              onClick={() => onSelect(code)}
            >
              <span className="language-card-name">{languageNames[code]}</span>
            </button>
          ))}
        </div>

        <p className="language-hint">{copy.hint}</p>
      </div>
    </div>
  )
}
