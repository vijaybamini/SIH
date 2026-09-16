import { useEffect, useRef, useState } from 'react'
import { languageNames } from './i18n'

export default function LanguageSwitcher({ language, setLanguage, className = '' }) {
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
    <div ref={switcherRef} className={`relative ${className}`}>
      <button
        className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 aria-expanded:border-brand-200 aria-expanded:bg-brand-50 aria-expanded:text-brand-700"
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" className="text-[15px] font-bold text-brand-400">文</span>
        <span className="hidden sm:inline">{languageNames[language]}</span>
        <span aria-hidden="true" className="text-xs">⌄</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[135px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-lg shadow-brand-900/10">
          {Object.entries(languageNames).map(([code, name]) => (
            <button
              key={code}
              type="button"
              className={`block w-full rounded-md px-2.5 py-2 text-left text-[13px] ${
                language === code
                  ? 'bg-brand-50 font-bold text-brand-700'
                  : 'font-medium text-[var(--text-secondary)] hover:bg-brand-50 hover:text-brand-700'
              }`}
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
