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
      <div className={`price-widget-row${isFeaturedCrop(cropName) ? ' featured' : ''}`}>
        <span className="price-widget-crop">{cropName}</span>
        <span className="price-widget-loading">{t.checkingPrice}</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={`price-widget-row${isFeaturedCrop(cropName) ? ' featured' : ''}`}>
        <span className="price-widget-crop">{cropName}</span>
        <span className="price-widget-unavailable">{t.priceUnavailable}</span>
      </div>
    )
  }

  const { farmer_net_price_per_kg, market_demand_trend_pct } = state.data
  return (
    <div className={`price-widget-row${isFeaturedCrop(cropName) ? ' featured' : ''}`}>
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

export default function PriceWidget({ crops, t }) {
  const cropNames = [...new Set((crops || []).map((crop) => crop.name).filter(Boolean))]
  if (cropNames.length === 0) return null

  return (
    <div className="price-widget">
      <h3>{t.todaysPrices}</h3>
      <div className="price-widget-card">
        {cropNames.map((name) => <CropPriceRow key={name} cropName={name} t={t} />)}
      </div>
      <p className="price-widget-note">{t.priceWidgetNote}</p>
    </div>
  )
}
