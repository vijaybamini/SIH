import { useState } from 'react'
import { languageNames } from './i18n'

export default function LanguageSwitcher({ language, setLanguage, className }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`utility-menu ${className || ''}`}>
      <button
        className="utility-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">文</span> {languageNames[language]} <span className="chevron">⌄</span>
      </button>
      {open && (
        <div className="utility-popover language-popover">
          {Object.entries(languageNames).map(([code, name]) => (
            <button
              key={code}
              type="button"
              className={language === code ? 'selected' : ''}
              onClick={() => {
                setLanguage(code)
                setOpen(false)
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
