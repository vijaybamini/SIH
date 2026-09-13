import { useEffect, useState } from 'react'
import { fetchFarmerPrice } from './api/aiBackend'

function trendClass(pct) {
  if (pct > 1) return 'up'
  if (pct < -1) return 'down'
  return 'flat'
}

function trendArrow(pct) {
  if (pct > 1) return '↑'
  if (pct < -1) return '↓'
  return '→'
}

function isFeaturedCrop(cropName) {
  return /rice|paddy|paddh|dhan/i.test(cropName || '')
}

function CropPriceRow({ cropName, t }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchFarmerPrice(cropName)
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }) })
      .catch((error) => { if (!cancelled) setState({ status: 'error', message: error.message }) })
    return () => { cancelled = true }
  }, [cropName])

  if (state.status === 'loading') {
    return (
      <div className="price-widget-row">
        <span className="price-widget-crop">{cropName}</span>
        <span className="price-widget-loading">{t.checkingPrice}</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="price-widget-row">
        <span className="price-widget-crop">{cropName}</span>
        <span className="price-widget-unavailable">{t.priceUnavailable}</span>
      </div>
    )
  }

  const { farmer_net_price_per_kg, market_demand_trend_pct } = state.data
  return (
    <div className="price-widget-row">
      <span className="price-widget-crop">{cropName}</span>
      <span className="price-widget-value">
        ₹{farmer_net_price_per_kg}/kg
        <em className={`price-trend price-trend-${trendClass(market_demand_trend_pct)}`}>
          {trendArrow(market_demand_trend_pct)} {Math.abs(market_demand_trend_pct)}%
        </em>
      </span>
    </div>
  )
}

function CropPriceHero({ cropName, t }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchFarmerPrice(cropName)
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }) })
      .catch((error) => { if (!cancelled) setState({ status: 'error', message: error.message }) })
    return () => { cancelled = true }
  }, [cropName])

  return (
    <article className="price-hero">
      <span className="price-hero-crop">{cropName}</span>

      {state.status === 'loading' && (
        <span className="price-hero-loading">{t.checkingPrice}</span>
      )}

      {state.status === 'error' && (
        <span className="price-hero-unavailable">{t.priceUnavailable}</span>
      )}

      {state.status === 'ok' && (
        <>
          <span className="price-hero-value">
            ₹{state.data.farmer_net_price_per_kg}
            <em className="price-hero-unit">/kg</em>
          </span>
          <div className="price-hero-meta">
            <span className="price-live">
              <span className="price-live-dot" aria-hidden="true" />
              {t.livePrice}
            </span>
            <em className={`price-trend price-trend-${trendClass(state.data.market_demand_trend_pct)}`}>
              {trendArrow(state.data.market_demand_trend_pct)} {Math.abs(state.data.market_demand_trend_pct)}%
            </em>
          </div>
        </>
      )}
    </article>
  )
}

export default function PriceWidget({ crops, t }) {
  const cropNames = [...new Set((crops || []).map((crop) => crop.name).filter(Boolean))]
  if (cropNames.length === 0) return null

  const featured = cropNames.find(isFeaturedCrop) || cropNames[0]
  const others = cropNames.filter((name) => name !== featured)

  return (
    <div className="price-widget">
      <h3 className="price-widget-title">{t.todaysPrices}</h3>
      <div className="price-hero-card">
        <CropPriceHero key={featured} cropName={featured} t={t} />
        {others.length > 0 && (
          <div className="price-widget-minor">
            {others.map((name) => <CropPriceRow key={name} cropName={name} t={t} />)}
          </div>
        )}
      </div>
      <p className="price-widget-note">{t.priceWidgetNote}</p>
    </div>
  )
}