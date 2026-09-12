import { useEffect, useRef, useState } from 'react'
import { languageNames } from './i18n'

export default function LanguageSwitcher({ language, setLanguage, className }) {
  const [open, setOpen] = useState(false)
  const switcherRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function closeOnOutsideClick(event) {
      if (!switcherRef.current?.contains(event.target)) setOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={switcherRef} className={`utility-menu ${className || ''}`}>
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
