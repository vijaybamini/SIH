import { Fragment, useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchPriceTrend } from './api/aiBackend'
import { fetchFarmerSalesHistory, fetchPriceAlerts, createPriceAlert, deletePriceAlert } from './api/farmer'
import { displayCropName } from './cropNames'

const CROP_COLORS = ['#3f8f5f', '#b0632b', '#1b5b8a', '#8a3fae', '#c2410c', '#0f6e56']

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function shortDate(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function buildChartData(trendByCrop, sales, selectedCrops) {
  const dateMap = new Map()
  selectedCrops.forEach((crop) => {
    const trend = trendByCrop[crop]?.data
    if (!trend) return
    trend.history.forEach((pt) => {
      const row = dateMap.get(pt.date) || { date: pt.date }
      row[`${crop}::actual`] = pt.price_per_kg
      dateMap.set(pt.date, row)
    })
    if (trend.history.length && trend.forecast.length) {
      const lastHist = trend.history[trend.history.length - 1]
      const row = dateMap.get(lastHist.date)
      if (row) row[`${crop}::forecast`] = lastHist.price_per_kg
    }
    trend.forecast.forEach((pt) => {
      const row = dateMap.get(pt.date) || { date: pt.date }
      row[`${crop}::forecast`] = pt.price_per_kg
      dateMap.set(pt.date, row)
    })
  })
  sales.forEach((sale) => {
    if (!selectedCrops.includes(sale.commodity)) return
    const dateKey = String(sale.date).slice(0, 10)
    const row = dateMap.get(dateKey) || { date: dateKey }
    row[`${sale.commodity}::sale`] = sale.pricePerKg
    dateMap.set(dateKey, row)
  })
  return [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function AdvisoryBanner({ trend, cropName, t }) {
  if (!trend) return null
  const signal = trend.demand_pressure_signal || ''
  const pct = trend.pct_change_vs_recent_avg || 0
  let tone = 'stable'
  if (signal.startsWith('RISING')) tone = 'rising'
  else if (signal.startsWith('FALLING')) tone = 'falling'

  const toneStyles = {
    rising: 'border-brand-300 bg-brand-50 text-brand-800',
    falling: 'border-[#f3d3cb] bg-[var(--color-error-bg)] text-[var(--color-error-ink)]',
    stable: 'border-[var(--border-subtle)] bg-cream-100 text-brand-900',
  }
  const messages = {
    rising: t.advisoryRising.replace('{crop}', cropName).replace('{pct}', Math.abs(pct).toFixed(1)),
    falling: t.advisoryFalling.replace('{crop}', cropName).replace('{pct}', Math.abs(pct).toFixed(1)),
    stable: t.advisoryStable.replace('{crop}', cropName),
  }

  return (
    <div className={`rounded-2xl border px-5 py-4 text-sm font-medium ${toneStyles[tone]}`}>
      <span className="mr-2 text-base" aria-hidden="true">{tone === 'rising' ? '📈' : tone === 'falling' ? '📉' : '➡️'}</span>
      {messages[tone]}
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-400">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-brand-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  )
}

function PriceAlerts({ farmerId, cropNames, language, t }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [commodity, setCommodity] = useState(cropNames[0] || '')
  const [threshold, setThreshold] = useState('')
  const [direction, setDirection] = useState('above')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    setLoading(true)
    fetchPriceAlerts(farmerId)
      .then((data) => setAlerts(data))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (farmerId) reload() }, [farmerId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const value = Number(threshold)
    if (!commodity || !Number.isFinite(value) || value <= 0) {
      setError(t.alertInvalid)
      return
    }
    setSubmitting(true)
    try {
      await createPriceAlert(farmerId, { commodity, thresholdPrice: value, direction })
      setThreshold('')
      reload()
    } catch (err) {
      setError(err.message || t.genericError)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deletePriceAlert(id)
      setAlerts((current) => current.filter((a) => a.id !== id))
    } catch { /* best-effort */ }
  }

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <h4 className="mb-3.5 font-display text-lg font-semibold text-brand-900">{t.priceAlertsTitle}</h4>
      <form onSubmit={handleSubmit} className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <select className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5 text-sm" value={commodity} onChange={(e) => setCommodity(e.target.value)}>
          {cropNames.map((name) => <option key={name} value={name}>{displayCropName(name, language)}</option>)}
        </select>
        <select className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5 text-sm" value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="above">{t.alertAbove}</option>
          <option value="below">{t.alertBelow}</option>
        </select>
        <input
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5 text-sm"
          type="number" min="0.01" step="0.01" placeholder={t.alertPriceLabel}
          value={threshold} onChange={(e) => setThreshold(e.target.value)}
        />
        <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {submitting ? t.pleaseWait : t.alertAdd}
        </button>
      </form>
      {error && <p className="mb-3 text-xs font-medium text-[var(--color-error)]">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">{t.pleaseWait}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t.noAlertsYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <li key={alert.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${alert.active ? 'border-brand-200 bg-brand-50' : 'border-[var(--border-subtle)] bg-cream-100 opacity-60'}`}>
              <span className="font-medium text-brand-900">
                {displayCropName(alert.commodity, language)} {alert.direction === 'above' ? t.alertAbove.toLowerCase() : t.alertBelow.toLowerCase()} ₹{alert.thresholdPrice}/kg
                {!alert.active && ` · ${t.alertTriggered}`}
              </span>
              <button type="button" className="text-xs font-bold text-[var(--color-error)]" onClick={() => handleDelete(alert.id)}>{t.alertRemove}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FarmerAnalytics({ crops, farmerId, language, t }) {
  const cropNames = useMemo(() => [...new Set((crops || []).map((c) => c.name).filter(Boolean))], [crops])
  const [selected, setSelected] = useState(() => (cropNames[0] ? [cropNames[0]] : []))
  const [trendByCrop, setTrendByCrop] = useState({})
  const [sales, setSales] = useState([])
  const [salesLoading, setSalesLoading] = useState(true)

  useEffect(() => {
    if (!farmerId) return
    setSalesLoading(true)
    fetchFarmerSalesHistory(farmerId)
      .then((data) => setSales(data))
      .catch(() => setSales([]))
      .finally(() => setSalesLoading(false))
  }, [farmerId])

  useEffect(() => {
    selected.forEach((crop) => {
      if (trendByCrop[crop]) return
      setTrendByCrop((current) => ({ ...current, [crop]: { status: 'loading' } }))
      fetchPriceTrend(crop)
        .then((data) => setTrendByCrop((current) => ({ ...current, [crop]: { status: 'ok', data } })))
        .catch((error) => setTrendByCrop((current) => ({ ...current, [crop]: { status: 'error', message: error.message } })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join('|')])

  function toggleCrop(name) {
    setSelected((current) => (current.includes(name) ? current.filter((c) => c !== name) : [...current, name]))
  }

  const chartData = useMemo(() => buildChartData(trendByCrop, sales, selected), [trendByCrop, sales, selected])

  const relevantSales = sales.filter((s) => selected.includes(s.commodity))
  const totalRevenue = relevantSales.reduce((sum, s) => sum + s.payout, 0)
  const totalKg = relevantSales.reduce((sum, s) => sum + s.allocatedKg, 0)
  const avgPrice = totalKg > 0 ? totalRevenue / totalKg : null

  const primaryTrend = trendByCrop[selected[0]]?.data
  const anyLoading = selected.some((c) => trendByCrop[c]?.status === 'loading')

  if (cropNames.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center">
        <p className="text-lg text-brand-900">{t.analyticsNoCrops}</p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-400">{t.dashboardLabel}</p>
        <h3 className="font-display text-3xl font-semibold text-brand-900">{t.navAnalytics}</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {cropNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggleCrop(name)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              selected.includes(name) ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-brand-900 hover:border-brand-300'
            }`}
          >
            {displayCropName(name, language)}
          </button>
        ))}
      </div>

      {selected.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t.analyticsSelectCrop}</p>
      ) : (
        <>
          <AdvisoryBanner trend={primaryTrend} cropName={displayCropName(selected[0], language)} t={t} />

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="font-display text-lg font-semibold text-brand-900">{t.analyticsMarketTrend}</h4>
              {anyLoading && <span className="text-xs text-[var(--text-muted)]">{t.pleaseWait}</span>}
            </div>
            <p className="mb-4 text-xs text-[var(--text-muted)]">{t.analyticsChartLegend}</p>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={30} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={44} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip labelFormatter={shortDate} formatter={(value) => [`₹${value}/kg`, '']} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {selected.map((crop, i) => {
                    const color = CROP_COLORS[i % CROP_COLORS.length]
                    const label = displayCropName(crop, language)
                    return (
                      <Fragment key={crop}>
                        <Line type="monotone" dataKey={`${crop}::actual`} name={`${label} (${t.analyticsHistory})`} stroke={color} dot={false} strokeWidth={2} connectNulls />
                        <Line type="monotone" dataKey={`${crop}::forecast`} name={`${label} (${t.analyticsForecast})`} stroke={color} strokeDasharray="5 5" dot={false} strokeWidth={2} connectNulls />
                        <Line type="monotone" dataKey={`${crop}::sale`} name={`${label} (${t.analyticsYourSales})`} stroke={color} strokeWidth={0} dot={{ r: 5, fill: color }} isAnimationActive={false} />
                      </Fragment>
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t.analyticsRevenue} value={salesLoading ? '…' : money(totalRevenue)} sub={t.analyticsForSelectedCrops} />
            <StatCard label={t.analyticsTotalSold} value={salesLoading ? '…' : `${totalKg.toLocaleString('en-IN')} kg`} />
            <StatCard label={t.analyticsAvgPrice} value={salesLoading ? '…' : avgPrice != null ? `₹${avgPrice.toFixed(2)}/kg` : t.analyticsNoSalesYet} />
          </div>

          <PriceAlerts farmerId={farmerId} cropNames={cropNames} language={language} t={t} />
        </>
      )}
    </section>
  )
}
