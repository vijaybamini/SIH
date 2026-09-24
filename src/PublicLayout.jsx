import { Link, NavLink, Outlet } from 'react-router-dom'
import Logo from './Logo'
import LanguageSwitcher from './LanguageSwitcher'
import Footer from './Footer'

const navLinkBase = 'group relative py-2 text-[15px] font-semibold tracking-tight text-brand-800 transition-colors hover:text-brand-600'
const primaryButton = 'inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition-all hover:-translate-y-0.5 hover:bg-brand-700'
const quietButton = 'inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-brand-800 transition-colors hover:text-brand-600'

export default function PublicLayout({
  language, t, copy, navItems, NAV_SUBMENUS,
  menuOpen, setMenuOpen, showAccessibilityMenu, setShowAccessibilityMenu,
  accessibility, toggleAccessibility, setFontSizeLevel, setSaturationLevel,
  fontSizeLevels, saturationLevels, defaultFontSizeLevel, defaultSaturationLevel,
  accessibilityClass, accessibilityStyle, setPanel, handleSetLanguage,
  openRegister, serviceOfferings, servicesLinks,
}) {
  return (
    <div className={`min-h-screen bg-[var(--surface)] font-sans text-[var(--text-primary)] ${accessibilityClass}`} style={accessibilityStyle}>
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-5 lg:flex-nowrap">
          <Logo to="/" label={t.homeLabel} />
          <nav className="order-3 hidden w-full justify-center lg:order-none lg:flex lg:w-auto lg:flex-1" aria-label={t.mainNavLabel}>
            <ul className="flex flex-wrap items-center justify-center gap-8">
              {navItems.map((item) => {
                const submenuLinks = NAV_SUBMENUS[item.key]
                return (
                  <li key={item.key} className={submenuLinks ? 'group/sub relative' : ''}>
                    <NavLink
                      to={item.href}
                      className={({ isActive }) => `${navLinkBase} ${isActive ? 'text-brand-600' : ''}`}
                    >
                      {({ isActive }) => (
                        <>
                          {item.label}
                          <span
                            aria-hidden="true"
                            className={`absolute -bottom-1.5 left-0 h-0.5 w-full origin-left rounded-full bg-brand-600 transition-transform duration-200 ${
                              isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                            }`}
                          />
                        </>
                      )}
                    </NavLink>
                    {submenuLinks && (
                      <div className="pointer-events-none absolute left-1/2 top-full z-10 -translate-x-1/2 pt-3.5 opacity-0 transition-all duration-200 group-hover/sub:pointer-events-auto group-hover/sub:opacity-100 group-focus-within/sub:pointer-events-auto group-focus-within/sub:opacity-100">
                        <ul className="min-w-[190px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 shadow-lg shadow-brand-900/10">
                          {submenuLinks.map((link) => (
                            <li key={link.key}>
                              <Link
                                to={link.href}
                                className={`block whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-brand-50 hover:text-brand-600 ${
                                  link.accent ? 'font-semibold text-brand-400' : 'text-brand-800'
                                }`}
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative">
              <button
                className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-sm font-semibold text-brand-800 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                aria-expanded={showAccessibilityMenu}
                aria-controls="accessibility-menu"
                onClick={() => setShowAccessibilityMenu(!showAccessibilityMenu)}
              >
                <span aria-hidden="true">♿</span>
                <span className="hidden sm:inline">{copy.accessibility}</span>
                <span className="text-xs">{showAccessibilityMenu ? '⌃' : '⌄'}</span>
              </button>
              {showAccessibilityMenu && (
                <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 min-w-[250px] max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-lg shadow-brand-900/10 sm:left-auto sm:right-0 sm:translate-x-0" id="accessibility-menu">
                  <div className="mb-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-600">{copy.fontSize}</span>
                      <button type="button" className="rounded p-0.5 text-[var(--text-muted)] transition-transform hover:-rotate-[70deg] hover:text-brand-600" aria-label={`${copy.resetLabel} ${copy.fontSize}`} onClick={() => setFontSizeLevel(defaultFontSizeLevel)}>↻</button>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button type="button" className="h-7 w-[30px] shrink-0 rounded-lg bg-brand-50 text-xs font-bold text-brand-800 hover:bg-brand-100 hover:text-brand-600" aria-label={`${copy.fontSize} -`} onClick={() => setFontSizeLevel(accessibility.fontSizeLevel - 1)}>A-</button>
                      <div className="flex flex-1 justify-center gap-1.5" role="group" aria-label={copy.fontSize}>
                        {fontSizeLevels.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={`h-2.5 w-2.5 rounded-full transition-transform ${accessibility.fontSizeLevel === index ? 'scale-[1.3] bg-brand-600' : 'bg-brand-200 hover:bg-brand-300'}`}
                            aria-label={`${copy.fontSize} ${index + 1}`}
                            aria-pressed={accessibility.fontSizeLevel === index}
                            onClick={() => setFontSizeLevel(index)}
                          />
                        ))}
                      </div>
                      <button type="button" className="h-7 w-[30px] shrink-0 rounded-lg bg-brand-50 text-xs font-bold text-brand-800 hover:bg-brand-100 hover:text-brand-600" aria-label={`${copy.fontSize} +`} onClick={() => setFontSizeLevel(accessibility.fontSizeLevel + 1)}>A+</button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-600">{copy.saturation}</span>
                      <button type="button" className="rounded p-0.5 text-[var(--text-muted)] transition-transform hover:-rotate-[70deg] hover:text-brand-600" aria-label={`${copy.resetLabel} ${copy.saturation}`} onClick={() => setSaturationLevel(defaultSaturationLevel)}>↻</button>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button type="button" className="h-7 w-[30px] shrink-0 rounded-lg bg-brand-50 text-xs font-bold text-brand-800 hover:bg-brand-100 hover:text-brand-600" aria-label={`${copy.saturation} -`} onClick={() => setSaturationLevel(accessibility.saturationLevel - 1)}>−</button>
                      <div className="flex flex-1 justify-center gap-1.5" role="group" aria-label={copy.saturation}>
                        {saturationLevels.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={`h-2.5 w-2.5 rounded-full transition-transform ${accessibility.saturationLevel === index ? 'scale-[1.3] bg-brand-600' : 'bg-brand-200 hover:bg-brand-300'}`}
                            aria-label={`${copy.saturation} ${index + 1}`}
                            aria-pressed={accessibility.saturationLevel === index}
                            onClick={() => setSaturationLevel(index)}
                          />
                        ))}
                      </div>
                      <button type="button" className="h-7 w-[30px] shrink-0 rounded-lg bg-brand-50 text-xs font-bold text-brand-800 hover:bg-brand-100 hover:text-brand-600" aria-label={`${copy.saturation} +`} onClick={() => setSaturationLevel(accessibility.saturationLevel + 1)}>+</button>
                    </div>
                  </div>

                  <div className="mb-2.5 h-px bg-[var(--border-subtle)]" />

                  <div className="grid gap-0.5">
                    <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-[13px] font-semibold text-brand-800 transition-colors hover:bg-brand-50 hover:text-brand-600 aria-pressed:bg-brand-100 aria-pressed:text-brand-700" aria-pressed={accessibility.screenReader} onClick={() => toggleAccessibility('screenReader')}>
                      <span aria-hidden="true">🔊</span>{copy.screenReader}
                    </button>
                    <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-[13px] font-semibold text-brand-800 transition-colors hover:bg-brand-50 hover:text-brand-600 aria-pressed:bg-brand-100 aria-pressed:text-brand-700" aria-pressed={accessibility.highContrast} onClick={() => toggleAccessibility('highContrast')}>
                      <span aria-hidden="true">◐</span>{copy.highContrastTheme}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--border-subtle)]" />
            <LanguageSwitcher language={language} setLanguage={handleSetLanguage} />
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button className={quietButton} onClick={() => setPanel('login')}>{copy.login}</button>
            <button className={primaryButton} onClick={() => setPanel('register')}>{copy.register}</button>
          </div>
          <button
            className="flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg lg:hidden"
            type="button"
            aria-label={t.menuToggleLabel}
            aria-expanded={menuOpen}
            aria-controls="site-nav-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={`block h-[2.5px] w-[22px] rounded bg-brand-800 transition-transform ${menuOpen ? 'translate-y-[7.5px] rotate-45' : ''}`} />
            <span className={`block h-[2.5px] w-[22px] rounded bg-brand-800 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-[2.5px] w-[22px] rounded bg-brand-800 transition-transform ${menuOpen ? '-translate-y-[7.5px] -rotate-45' : ''}`} />
          </button>
        </div>
      </header>

      {menuOpen && (
        <nav className="flex flex-col border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 pb-4.5 pt-2.5 shadow-lg lg:hidden" id="site-nav-menu" aria-label={t.mainNavLabel}>
          <ul className="flex flex-col">
            {navItems.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) => `block rounded-lg px-3 py-3.5 text-base font-semibold transition-colors hover:bg-brand-50 hover:text-brand-600 ${isActive ? 'text-brand-600' : 'text-brand-800'}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2 flex gap-2 pt-2">
              <button className={`${quietButton} flex-1 justify-center border border-[var(--border-subtle)]`} onClick={() => { setPanel('login'); setMenuOpen(false) }}>{copy.login}</button>
              <button className={`${primaryButton} flex-1 justify-center`} onClick={() => { setPanel('register'); setMenuOpen(false) }}>{copy.register}</button>
            </li>
          </ul>
        </nav>
      )}

      <main>
        <Outlet context={{ t, copy, language, openRegister, setPanel, serviceOfferings, servicesLinks }} />
      </main>

      <Footer copy={copy} />
    </div>
  )
}
