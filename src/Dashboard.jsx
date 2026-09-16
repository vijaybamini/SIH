import { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import LanguageSwitcher from './LanguageSwitcher'
import PriceWidget from './PriceWidget'
import FarmerAnalytics from './FarmerAnalytics'
import Logo from './Logo'
import { useTranslation } from './i18n'
import { fetchFarmerPrice } from './api/aiBackend'
import { displayCropName } from './cropNames'

const PORTFOLIO_COLORS = ['#a9c76f', '#e5f2bb', '#71953b', '#dcebc4', '#4d9c68', '#cbe4a0']

const MENU_PROXIMITY_MARGIN = 28
const MENU_CLOSE_DELAY_MS = 300

function useHoverMenu() {
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)
  const wrapRef = useRef(null)
  const tooltipRef = useRef(null)

  function show() {
    clearTimeout(timer.current)
    setVisible(true)
  }
  function hide() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), MENU_CLOSE_DELAY_MS)
  }

  useEffect(() => {
    if (!visible) return undefined
    function cursorNear(event) {
      const wrap = wrapRef.current
      if (!wrap) return false
      const rects = [wrap.getBoundingClientRect()]
      const tooltip = tooltipRef.current
      if (tooltip && !tooltip.hidden) rects.push(tooltip.getBoundingClientRect())
      return rects.some((rect) =>
        event.clientX >= rect.left - MENU_PROXIMITY_MARGIN &&
        event.clientX <= rect.right + MENU_PROXIMITY_MARGIN &&
        event.clientY >= rect.top - MENU_PROXIMITY_MARGIN &&
        event.clientY <= rect.bottom + MENU_PROXIMITY_MARGIN
      )
    }
    function handleMouseMove(event) {
      clearTimeout(timer.current)
      if (cursorNear(event)) return
      timer.current = setTimeout(() => setVisible(false), MENU_CLOSE_DELAY_MS)
    }
    function handleClickOutside(event) {
      const wrap = wrapRef.current
      if (wrap && wrap.contains(event.target)) return
      const tooltip = tooltipRef.current
      if (tooltip && tooltip.contains(event.target)) return
      setVisible(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleClickOutside)
      clearTimeout(timer.current)
    }
  }, [visible])

  return [visible, show, hide, wrapRef, tooltipRef]
}

// Shared per-crop live price fetch -- both PriceWidget and the portfolio
// summary card need the same numbers, so this fetches each crop name once
// instead of each display fetching it independently.
export function useCropPrices(cropNames) {
  const [prices, setPrices] = useState({})
  const key = cropNames.join('|')

  useEffect(() => {
    let cancelled = false
    cropNames.forEach((name) => {
      setPrices((current) => {
        if (current[name]) return current
        return { ...current, [name]: { status: 'loading' } }
      })
      fetchFarmerPrice(name)
        .then((data) => { if (!cancelled) setPrices((current) => ({ ...current, [name]: { status: 'ok', data } })) })
        .catch((error) => { if (!cancelled) setPrices((current) => ({ ...current, [name]: { status: 'error', message: error.message } })) })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return prices
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function PortfolioSummaryCard({ crops, prices, language, t }) {
  const byCrop = new Map()
  crops.forEach((crop) => {
    const quintals = Number(crop.turnover)
    const priceEntry = prices[crop.name]
    if (!Number.isFinite(quintals) || quintals <= 0 || priceEntry?.status !== 'ok') return
    const perKg = priceEntry.data?.farmer_net_price_per_kg
    if (!Number.isFinite(perKg)) return
    const value = quintals * 100 * perKg
    byCrop.set(crop.name, (byCrop.get(crop.name) || 0) + value)
  })

  const breakdown = [...byCrop.entries()]
    .map(([name, value]) => ({ name, displayName: displayCropName(name, language), value }))
    .sort((a, b) => b.value - a.value)
  const total = breakdown.reduce((sum, entry) => sum + entry.value, 0)
  const pricedCrops = breakdown.length

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white shadow-lg shadow-brand-900/20">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-100">{t.portfolioValueLabel}</p>
      <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{money(total)}</p>
      <p className="mt-1.5 text-xs text-brand-100/90">
        {pricedCrops > 0 ? t.portfolioValueHint.replace('{n}', pricedCrops) : t.portfolioValueEmpty}
      </p>

      {breakdown.length > 0 && (
        <div className="mt-5 flex items-center gap-4 border-t border-white/15 pt-5">
          <div className="h-[92px] w-[92px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="displayName" innerRadius={26} outerRadius={44} paddingAngle={breakdown.length > 1 ? 3 : 0} stroke="none">
                  {breakdown.map((entry, i) => <Cell key={entry.name} fill={PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => money(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
            {breakdown.slice(0, 4).map((entry, i) => (
              <li key={entry.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-brand-100">{entry.displayName}</span>
                <span className="shrink-0 font-semibold tabular-nums">{Math.round((entry.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProfileMenu({ profileComplete, onOpenCompleteProfile, onLogout, tooltipRef, visible, t }) {
  return (
    <div
      className="absolute right-0 top-[calc(100%+10px)] z-20 w-[250px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-lg shadow-brand-900/15"
      role="menu"
      ref={tooltipRef}
      hidden={!visible}
    >
      {!profileComplete && (
        <>
          <p className="mb-3 text-sm leading-relaxed text-[var(--text-secondary)]">{t.profileIncompleteMsg}</p>
          <button className="mb-3 w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-700" onClick={onOpenCompleteProfile}>{t.completeProfile} →</button>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-brand-900 hover:bg-brand-50" onClick={onOpenCompleteProfile}><span aria-hidden="true">👤</span> {t.viewProfile}</button>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-brand-900 hover:bg-brand-50" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
      </div>
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

function sortCropHistory(crops) {
  return [...crops].sort((a, b) => {
    const aTime = a.plantedDate ? new Date(a.plantedDate).getTime() : 0
    const bTime = b.plantedDate ? new Date(b.plantedDate).getTime() : 0
    return bTime - aTime
  })
}

function ProgressBar({ pct }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function CropHistoryCard({ crop, language, t }) {
  const progress = cropProgress(crop.plantedDate, crop.expectedHarvestDate)
  const status = crop.harvested
    ? t.harvested
    : (progress && progress.daysLeft > 0 ? t.harvestIn.replace('{n}', progress.daysLeft) : t.readyToHarvest)
  return (
    <article className={`rounded-2xl border p-6 ${crop.harvested ? 'border-[var(--border-subtle)] bg-[var(--surface-raised)]' : 'border-[#e7e3d3] bg-cream-300'}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <strong className="font-display text-xl font-semibold text-brand-900">{displayCropName(crop.name, language)}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold ${crop.harvested ? 'bg-[#ecebe6] text-[#5b6259]' : 'bg-brand-100 text-brand-700'}`}>{status}</span>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#eef1ea] bg-white/70 p-3.5">
          <span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{t.landLabel}</span>
          <strong className="text-brand-900">{crop.landUsed ? `${crop.landUsed} ${t.acres}` : '—'}</strong>
        </div>
        <div className="rounded-xl border border-[#eef1ea] bg-white/70 p-3.5">
          <span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{t.turnoverLabel}</span>
          <strong className="text-brand-900">{crop.turnover ? `${crop.turnover} ${t.quintals}` : '—'}</strong>
        </div>
        <div className="rounded-xl border border-[#eef1ea] bg-white/70 p-3.5">
          <span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{t.datePlanted}</span>
          <strong className="text-brand-900">{crop.plantedDate || '—'}</strong>
        </div>
        <div className="rounded-xl border border-[#eef1ea] bg-white/70 p-3.5">
          <span className="block text-xs font-bold uppercase tracking-wide text-brand-400">{crop.harvested ? t.dateHarvested : t.expectedHarvestDate}</span>
          <strong className="text-brand-900">{(crop.harvested ? crop.actualHarvestDate : crop.expectedHarvestDate) || '—'}</strong>
        </div>
      </div>
      {progress && !crop.harvested && (
        <div className="mt-5 flex items-center gap-3.5">
          <ProgressBar pct={progress.pct} />
          <span className="shrink-0 text-lg font-extrabold text-brand-900">{progress.pct}%</span>
        </div>
      )}
    </article>
  )
}

function CropHistoryPage({ crops, language, t }) {
  const current = sortCropHistory(crops.filter((crop) => !crop.harvested))
  const past = sortCropHistory(crops.filter((crop) => crop.harvested))
  const hasAny = current.length > 0 || past.length > 0
  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-400">{t.stepCropDetails}</p>
        <h3 className="font-display text-3xl font-semibold text-brand-900">{t.navCropHistory}</h3>
      </div>
      <p className="-mt-3 text-base leading-relaxed text-[var(--text-muted)]">{t.cropHistorySubtitle}</p>

      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
          <p className="text-lg text-brand-900">{t.noCropsYet}</p>
        </div>
      ) : (
        <>
          {current.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-2.5 border-b border-[#e2e7dc] pb-3">
                <h4 className="font-display text-xl font-semibold text-brand-900">{t.currentCrops}</h4>
                <span className="min-w-[26px] rounded-full bg-brand-600 px-2.5 py-1.5 text-center text-xs font-bold leading-none text-white">{current.length}</span>
              </div>
              <div className="grid gap-4">
                {current.map((crop) => <CropHistoryCard key={crop.id} crop={crop} language={language} t={t} />)}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-2.5 border-b border-[#e2e7dc] pb-3">
                <h4 className="font-display text-xl font-semibold text-brand-900">{t.pastCrops}</h4>
                <span className="min-w-[26px] rounded-full bg-brand-600 px-2.5 py-1.5 text-center text-xs font-bold leading-none text-white">{past.length}</span>
              </div>
              <div className="grid gap-4">
                {past.map((crop) => <CropHistoryCard key={crop.id} crop={crop} language={language} t={t} />)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function Dashboard({ user, farmerProfile, language, setLanguage, onOpenCompleteProfile, onQuickAddCrop, onMarkCropHarvested, onLogout }) {
  const t = useTranslation(language)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTopMenu, showTop, hideTop, wrapRef, tooltipRef] = useHoverMenu()
  const [dismissedIds, setDismissedIds] = useState([])
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'

  const navItems = [
    ['Dashboard', t.navDashboard], ['CropHistory', t.navCropHistory], ['Analytics', t.navAnalytics],
  ]

  const allCrops = farmerProfile?.crops?.filter((crop) => crop.name) ?? []
  const crops = allCrops.filter((crop) => !crop.harvested)
  const pastCrops = allCrops.filter((crop) => crop.harvested)
  const cropNames = [...new Set(allCrops.map((crop) => crop.name))]
  const prices = useCropPrices(cropNames)

  const navButtonClass = (active) =>
    `rounded-xl px-4 py-3.5 text-left text-[16px] font-medium transition-colors ${
      active ? 'bg-white font-bold text-brand-900 shadow-sm' : 'text-[var(--sidebar-text,#4a5c40)] hover:bg-white/55 hover:text-brand-900'
    }`

  return (
    <div
      className="flex bg-cream-200 font-sans text-[15px] leading-relaxed text-[var(--text-primary)]"
      style={{ zoom: 0.81, minHeight: 'calc(100vh / 0.81)' }}
    >
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#dcebc4] p-7">
        <div className="mb-9 px-2"><Logo /></div>

        <nav className="flex flex-col gap-1.5" aria-label={t.dashboardNavLabel}>
          {navItems.map(([key, label]) => (
            <button key={key} className={navButtonClass(activeNav === key)} onClick={() => setActiveNav(key)}>{label}</button>
          ))}
        </nav>

        <button className="mt-auto flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-left text-[16px] font-medium text-[#4a5c40] hover:text-brand-900" onClick={onLogout}>
          <span aria-hidden="true">⤶</span> {t.logout}
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-9 pb-14 pt-8">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-400">{t.dashboardLabel}</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-brand-900">{t.welcomeBack}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          </div>
          <div className="flex items-center gap-3.5">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="relative" ref={wrapRef} onMouseEnter={showTop}>
              <div
                className="relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
                tabIndex={0}
                onClick={showTop}
                onFocus={showTop}
                onBlur={hideTop}
              >
                {initials}
                {!user.profileComplete && (
                  <span className="absolute -right-1 -top-1 flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 border-cream-300 bg-cream-300 text-sm font-extrabold text-brand-600" aria-label={t.profileIncompleteLabel}>!</span>
                )}
              </div>
              <ProfileMenu
                profileComplete={user.profileComplete}
                onOpenCompleteProfile={onOpenCompleteProfile}
                onLogout={onLogout}
                tooltipRef={tooltipRef}
                visible={showTopMenu}
                t={t}
              />
            </div>
          </div>
        </header>

        {activeNav === 'CropHistory' ? (
          <CropHistoryPage crops={allCrops} language={language} t={t} />
        ) : activeNav === 'Analytics' ? (
          <FarmerAnalytics crops={allCrops} farmerId={user.id} language={language} t={t} />
        ) : (
          <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[340px_1fr]">
            <div className="flex flex-col gap-4">
              <h3 className="font-display text-2xl font-bold text-brand-900">{t.farmerDetails}</h3>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-brand-50 p-5">
                <div className="mb-4">
                  {farmerProfile?.photo ? (
                    <img className="block h-[260px] w-full rounded-xl object-cover" src={farmerProfile.photo} alt="" />
                  ) : (
                    <div className="flex h-[260px] items-center justify-center rounded-xl bg-brand-600 text-4xl font-extrabold text-white" aria-hidden="true">{initials}</div>
                  )}
                </div>
                {[
                  [t.name, user.name],
                  [t.locationLabel, farmerProfile?.cropLocation],
                  [t.farmSize, farmerProfile?.areaOfLand ? `${farmerProfile.areaOfLand} ${t.acres}` : null],
                  [t.cropsLabel, allCrops.map((crop) => displayCropName(crop.name, language)).filter(Boolean).join(', ')],
                  [t.joined, user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : null],
                ].map(([label, value], i) => (
                  <div key={label} className={`flex flex-col gap-1 py-3 ${i > 0 ? 'border-t border-brand-600/10' : 'pt-0'}`}>
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-400">{label}</span>
                    <strong className="text-lg text-brand-900">{value || '—'}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <PortfolioSummaryCard crops={allCrops} prices={prices} language={language} t={t} />
              <div className="mt-7">
                <PriceWidget crops={allCrops} prices={prices} language={language} t={t} />
              </div>

              <button
                type="button"
                onClick={onQuickAddCrop}
                className="mt-8 flex w-full items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-6 py-7 text-lg font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-3xl font-bold leading-none text-white" aria-hidden="true">+</span>
                {t.addAnotherCrop}
              </button>

              <h3 className="mb-3.5 mt-8 font-display text-2xl font-bold text-brand-900">{t.currentCrops}</h3>
              {crops.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
                  <p className="mb-3.5 text-lg text-brand-900">{user.profileComplete ? t.noCropsYet : t.completeProfilePrompt}</p>
                  {!user.profileComplete && <button className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" onClick={onOpenCompleteProfile}>{t.completeProfile}</button>}
                </div>
              ) : (
                <div className="grid gap-3.5">
                  {crops.map((crop) => {
                    const progress = cropProgress(crop.plantedDate, crop.expectedHarvestDate)
                    const showHarvestPrompt = progress && progress.pct >= 100 && !dismissedIds.includes(crop.id)
                    return (
                      <article className="rounded-2xl border border-[var(--border-subtle)] bg-cream-100 px-5.5 py-5" key={crop.id}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <strong className="text-lg font-bold text-brand-900">{displayCropName(crop.name, language)}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
                          {progress && (
                            <span className="text-sm font-bold text-brand-400">{progress.daysLeft > 0 ? t.harvestIn.replace('{n}', progress.daysLeft) : t.readyToHarvest}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4.5">
                          <div className="flex w-1/2 shrink-0 items-center gap-2.5">
                            {progress ? (
                              <>
                                <ProgressBar pct={progress.pct} />
                                <span className="shrink-0 text-2xl font-extrabold text-brand-900">{progress.pct}%</span>
                              </>
                            ) : <div className="h-2 flex-1 rounded-full bg-brand-100" aria-hidden="true" />}
                          </div>
                          <div className="ml-auto flex flex-col gap-0.5 text-right">
                            <span className="text-xs font-bold uppercase text-brand-400">{t.turnoverLabel}</span>
                            <strong className="text-lg font-extrabold text-brand-900">{crop.turnover ? `${crop.turnover} ${t.quintals}` : '—'}</strong>
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-brand-900">
                          <span>{t.landLabel}: <b>{crop.landUsed ? `${crop.landUsed} ${t.acres}` : '—'}</b></span>
                        </div>
                        {showHarvestPrompt && (
                          <div className="mt-3.5 rounded-lg border border-[#ecdca0] bg-[#fdf6e0] px-4 py-3.5">
                            <span className="mb-2.5 block text-sm font-bold text-brand-900">{t.didYouHarvest}</span>
                            <div className="flex gap-2.5">
                              <button type="button" className="min-h-[44px] flex-1 rounded-lg border-2 border-[#dfe6dc] bg-white font-bold text-brand-900 hover:border-brand-400" onClick={() => onMarkCropHarvested(crop.id)}>{t.yes}</button>
                              <button type="button" className="min-h-[44px] flex-1 rounded-lg border-2 border-[#dfe6dc] bg-white font-bold text-brand-900 hover:border-brand-400" onClick={() => setDismissedIds((current) => [...current, crop.id])}>{t.no}</button>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}

              <h3 className="mb-3.5 mt-8 font-display text-2xl font-bold text-brand-900">{t.pastCrops}</h3>
              {pastCrops.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
                  <p className="text-lg text-brand-900">{t.noPastCropsYet}</p>
                </div>
              ) : (
                <div className="grid gap-3.5">
                  {pastCrops.map((crop) => (
                    <article className="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-4.5" key={crop.id}>
                      <strong className="mb-2.5 block text-lg font-bold text-brand-900">{displayCropName(crop.name, language)}{crop.specificType ? ` · ${crop.specificType}` : ''}</strong>
                      <div className="flex flex-wrap gap-4.5 text-sm text-brand-900">
                        <span>{t.turnoverLabel}: <b>{crop.turnover ? `${crop.turnover} ${t.quintals}` : '—'}</b></span>
                        <span>{t.landLabel}: <b>{crop.landUsed ? `${crop.landUsed} ${t.acres}` : '—'}</b></span>
                        <span>{t.dateHarvested}: <b>{crop.actualHarvestDate || crop.expectedHarvestDate || '—'}</b></span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
