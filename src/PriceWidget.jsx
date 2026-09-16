import { displayCropName } from './cropNames'

function trendArrow(pct) {
  if (pct > 1) return '↑'
  if (pct < -1) return '↓'
  return '→'
}

function CropPriceCard({ cropName, displayName, entry, t }) {
  const status = entry?.status || 'loading'
  return (
    <article className="flex flex-col justify-center rounded-2xl bg-brand-700 p-5 text-white">
      <span className="text-xs font-semibold uppercase tracking-wide text-brand-100">{displayName}</span>

      {status === 'loading' && <span className="mt-3 text-sm text-brand-100">{t.checkingPrice}</span>}
      {status === 'error' && <span className="mt-3 text-sm text-brand-100">{t.priceUnavailable}</span>}

      {status === 'ok' && (
        <>
          <span className="mt-1.5 font-display text-3xl font-semibold tabular-nums">
            ₹{entry.data.farmer_net_price_per_kg}
            <em className="ml-1 text-sm font-normal not-italic text-brand-100">/kg</em>
          </span>
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-100">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8fe3b0]" aria-hidden="true" />
              {t.livePrice}
            </span>
            <em className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold not-italic">
              {trendArrow(entry.data.market_demand_trend_pct)} {Math.abs(entry.data.market_demand_trend_pct)}%
            </em>
          </div>
        </>
      )}
    </article>
  )
}

export default function PriceWidget({ crops, prices, language, t }) {
  const cropNames = [...new Set((crops || []).map((crop) => crop.name).filter(Boolean))]
  if (cropNames.length === 0) return null

  return (
    <div>
      <h3 className="mb-3.5 font-display text-2xl font-bold text-brand-900">{t.todaysPrices}</h3>
      <div className="grid grid-cols-1 gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:grid-cols-2 lg:grid-cols-3">
        {cropNames.map((name) => (
          <CropPriceCard key={name} cropName={name} displayName={displayCropName(name, language)} entry={prices?.[name]} t={t} />
        ))}
      </div>
      <p className="mt-2.5 text-xs text-[var(--text-muted)]">{t.priceWidgetNote}</p>
    </div>
  )
}
