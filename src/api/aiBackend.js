// Client for the FastAPI/uvicorn pricing backend (AI_backend/). Defaults to
// the local dev server; set VITE_AI_BACKEND_URL to point at a deployed
// backend (e.g. the Render URL) for staging/production builds.
const BASE_URL = (import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '')

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error(`Could not reach the pricing backend at ${BASE_URL}. Is it running?`)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return data
}

export function fetchCommodities() {
  return request('/api/commodities')
}

export function fetchMarkets(commodity) {
  return request(`/api/markets?commodity=${encodeURIComponent(commodity)}`)
}

export function fetchSupply(commodity) {
  return request(`/api/supply?commodity=${encodeURIComponent(commodity)}`)
}

export function fetchFarmerPrice(commodity) {
  return request(`/api/farmer-price?commodity=${encodeURIComponent(commodity)}`)
}

export function fetchQuote(payload) {
  return request('/api/quote', { method: 'POST', body: JSON.stringify(payload) })
}

export function placeOrder(payload) {
  return request('/api/orders', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchPriceTrend(commodity, { market, historyDays = 90, forecastDays = 14 } = {}) {
  const params = new URLSearchParams({ commodity, history_days: historyDays, forecast_days: forecastDays })
  if (market) params.set('market', market)
  return request(`/api/price-trend?${params.toString()}`)
}

export function validatePincode(pincode) {
  return request(`/api/validate-pincode?pincode=${encodeURIComponent(pincode)}`)
}

export function requestEmailOtp(email) {
  return request('/api/auth/request-email-otp', { method: 'POST', body: JSON.stringify({ email }) })
}

export function verifyEmailOtpCode(email, code) {
  return request('/api/auth/verify-email-otp', { method: 'POST', body: JSON.stringify({ email, code }) })
}
