import { useEffect, useState } from 'react'
import Logo from './Logo'

const navButtonClass = (active) =>
  `rounded-xl px-4 py-3.5 text-left text-[16px] font-medium transition-colors ${
    active ? 'bg-white font-bold text-brand-900 shadow-sm' : 'text-[#4a5c40] hover:bg-white/55 hover:text-brand-900'
  }`

export default function DashboardShell({
  navItems, activeNav, onNavSelect, onLogout, logoutLabel,
  actions, eyebrow, greeting, navLabel, menuLabel, logoLabel = 'F2C', zoom = null, children,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const zoomStyle = zoom ? { zoom, minHeight: `calc(100vh / ${zoom})` } : null

  useEffect(() => {
    if (!drawerOpen) return undefined
    function onKey(event) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    function onResize() {
      if (window.matchMedia('(min-width: 1024px)').matches) setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [drawerOpen])

  function selectNav(key) {
    onNavSelect(key)
    setDrawerOpen(false)
  }

  const navButtons = navItems.map(([key, label]) => (
    <button key={key} className={navButtonClass(activeNav === key)} onClick={() => selectNav(key)}>{label}</button>
  ))

  return (
    <div className="flex min-h-screen flex-col bg-cream-200 font-sans text-[16px] leading-relaxed text-[var(--text-primary)]" style={zoomStyle}>
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-cream-200/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-9 lg:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg lg:hidden"
              aria-label={menuLabel}
              aria-expanded={drawerOpen}
              aria-controls="dash-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <span className="flex flex-col gap-1.5">
                <span className="block h-[2.5px] w-[22px] rounded bg-brand-800" />
                <span className="block h-[2.5px] w-[22px] rounded bg-brand-800" />
                <span className="block h-[2.5px] w-[22px] rounded bg-brand-800" />
              </span>
            </button>
            <div className="hidden min-w-0 lg:block">
              {eyebrow && <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-400">{eyebrow}</p>}
              {greeting && <h2 className="truncate font-display text-2xl font-bold tracking-tight text-brand-900 lg:text-3xl">{greeting}</h2>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3.5">{actions}</div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-[260px] shrink-0 flex-col bg-[#dcebc4] p-7 lg:flex">
          <div className="mb-9 px-2"><Logo label={logoLabel} /></div>
          <nav className="flex flex-col gap-1.5" aria-label={navLabel}>
            {navButtons}
          </nav>
          <button
            className="mt-auto flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-left text-[16px] font-medium text-[#4a5c40] hover:text-brand-900"
            onClick={onLogout}
          >
            <span aria-hidden="true">⤶</span> {logoutLabel}
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-14 pt-5 sm:px-6 lg:px-9 lg:pt-8">
          <div className="lg:hidden">
            {eyebrow && <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-400">{eyebrow}</p>}
            {greeting && <h2 className="mb-6 font-display text-2xl font-bold tracking-tight text-brand-900">{greeting}</h2>}
          </div>
          {children}
        </main>
      </div>

      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`absolute inset-0 bg-brand-900/45 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id="dash-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={navLabel}
          className={`absolute inset-y-0 left-0 flex w-[80vw] max-w-[280px] flex-col bg-[#dcebc4] p-6 shadow-2xl shadow-brand-900/25 transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="mb-8 flex items-center justify-between gap-3">
            <Logo label={logoLabel} />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-brand-800 hover:text-brand-900"
              aria-label="Close"
              onClick={() => setDrawerOpen(false)}
            >
              ×
            </button>
          </div>
          <nav className="flex flex-col gap-1.5" aria-label={navLabel}>
            {navButtons}
          </nav>
          <button
            className="mt-auto flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-left text-[16px] font-medium text-[#4a5c40] hover:text-brand-900"
            onClick={onLogout}
          >
            <span aria-hidden="true">⤶</span> {logoutLabel}
          </button>
        </aside>
      </div>
    </div>
  )
}