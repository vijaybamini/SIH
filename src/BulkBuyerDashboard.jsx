import { useEffect, useMemo, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { fetchCommodities, fetchQuote, placeOrder } from './api/aiBackend'

const CATEGORIES = ['All', 'Fruits', 'Vegetables', 'Grains', 'Pulses', 'Other']

function commodityCategory(name) {
  const n = name.toLowerCase()
  if (/apple|banana|mango/.test(n)) return 'Fruits'
  if (/chilli|brinjal|cabbage|carrot|cauliflower|garlic|ginger|bhindi/.test(n)) return 'Vegetables'
  if (/rice|wheat|bajra|jowar|maize|millet|sorghum/.test(n)) return 'Grains'
  if (/gram|lentil|arhar|moong|groundnut|soyabean/.test(n)) return 'Pulses'
  return 'Other'
}

// Wikimedia Commons photos of the raw commodity (not a dish/logo/diagram).
// Keyed by the exact commodity strings the AI backend returns.
const COMMODITY_IMAGES = {
  'Apple': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Apples_in_basket_2018_G2.jpg/500px-Apples_in_basket_2018_G2.jpg',
  'Arhar (Tur/Red Gram)(Whole)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Pigeon_pea_pods_dried_with_ruler.jpg/500px-Pigeon_pea_pods_dried_with_ruler.jpg',
  'Bajra(Pearl Millet/Cumbu)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Pearl_millet_grain.jpg/500px-Pearl_millet_grain.jpg',
  'Banana': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Bunch_of_bananas_on_sale.jpg/500px-Bunch_of_bananas_on_sale.jpg',
  'Bhindi(Ladies Finger)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Bucket_of_raw_okra_pods.jpg/500px-Bucket_of_raw_okra_pods.jpg',
  'Brinjal': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/An_Indian_Purple_Eggplant_%28Brinjal%29.jpg/500px-An_Indian_Purple_Eggplant_%28Brinjal%29.jpg',
  'Cabbage': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Fresh_Cabbage_vegetables.jpg/500px-Fresh_Cabbage_vegetables.jpg',
  'Carrot': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Carrots_of_many_colors.jpg/500px-Carrots_of_many_colors.jpg',
  'Cauliflower': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Tray_of_cauliflowers_on_Lordship_Lane_Tottenham_London_England.jpg/500px-Tray_of_cauliflowers_on_Lordship_Lane_Tottenham_London_England.jpg',
  'Cotton': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Mature_cotton_boll_in_Raichur%2C_Karnataka.jpg/500px-Mature_cotton_boll_in_Raichur%2C_Karnataka.jpg',
  'Garlic': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Garlic_bulbs_and_cloves.jpg/500px-Garlic_bulbs_and_cloves.jpg',
  'Ginger(Green)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Fresh_ginger_rhizome_01.jpg/500px-Fresh_ginger_rhizome_01.jpg',
  'Green Chilli': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Green_chili_peppers.jpg/500px-Green_chili_peppers.jpg',
  'Green Gram (Moong)(Whole)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Mung_beans_%28Vigna_radiata%29.jpg/500px-Mung_beans_%28Vigna_radiata%29.jpg',
  'Groundnut': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Groundnut_of_Salem.jpg/500px-Groundnut_of_Salem.jpg',
  'Gur(Jaggery)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Sa-indian-gud.jpg/500px-Sa-indian-gud.jpg',
  'Jowar(Sorghum)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Sorghum_seed.jpg/500px-Sorghum_seed.jpg',
  'Lentil (Masur)(Whole)': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Lens_culinaris_seeds.jpg/500px-Lens_culinaris_seeds.jpg',
  'Maize': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Dried_corn_cobs_and_kernels_stored_in_a_rustic_barn_during_autumn_harvest_season.jpg/500px-Dried_corn_cobs_and_kernels_stored_in_a_rustic_barn_during_autumn_harvest_season.jpg',
  'Mango': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Mango_fruit_Nam_Dok_Mai.jpg/500px-Mango_fruit_Nam_Dok_Mai.jpg',
  'Mustard': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Mustard_Seeds_in_a_plate_at_Reganigudem.jpg/500px-Mustard_Seeds_in_a_plate_at_Reganigudem.jpg',
  'Soyabean': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Soybean.USDA.jpg/500px-Soybean.USDA.jpg',
  'Wheat': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Wheat_close-up.JPG/500px-Wheat_close-up.JPG',
}

function commodityIcon(name) {
  const n = name.toLowerCase()
  if (/apple|banana|mango/.test(n)) return '🍎'
  if (/rice/.test(n)) return '🍚'
  if (/wheat|bajra|jowar|maize|millet|sorghum/.test(n)) return '🌾'
  if (/chilli|brinjal|cabbage|carrot|cauliflower|garlic|ginger|bhindi/.test(n)) return '🥦'
  if (/gram|lentil|arhar|moong|groundnut|soyabean/.test(n)) return '🫘'
  if (/mustard|cotton/.test(n)) return '🌱'
  if (/jaggery|gur/.test(n)) return '🍯'
  return '🌿'
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function CommodityCard({ commodity, onSelect }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = COMMODITY_IMAGES[commodity]

  return (
    <article className="buyer-product-card">
      <div className="buyer-product-media">
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt={commodity} loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="buyer-product-media-fallback" aria-hidden="true">{commodityIcon(commodity)}</div>
        )}
      </div>
      <div className="buyer-product-body">
        <h4 className="buyer-product-name">{commodity}</h4>
        <div className="buyer-product-footer">
          <button type="button" className="button button-primary buyer-add-button" onClick={() => onSelect(commodity)}>
            Get price
          </button>
        </div>
      </div>
    </article>
  )
}

function QuoteBreakdown({ result }) {
  const perKg = result.consumer_breakdown.per_kg_breakdown
  const totals = result.consumer_breakdown.order_totals
  const market = result.consumer_breakdown.market_intelligence_metrics
  return (
    <div className="summary-crop-card">
      <strong>Your price ({result.order_demand_kg}kg{result.requested_kg !== result.order_demand_kg ? `, of ${result.requested_kg}kg requested` : ''})</strong>
      <div className="summary-grid">
        <div><span>Price per kg</span><strong>{money(perKg.final_checkout_price_per_kg)}</strong></div>
        <div><span>Order total</span><strong>{money(totals.grand_total_to_pay)}</strong></div>
        <div><span>Demand trend</span><strong>{market.macro_market_trend}</strong></div>
      </div>
    </div>
  )
}

function QuoteModal({ commodity, buyerId, buyerPincode, onClose }) {
  const [quantity, setQuantity] = useState('500')
  const [pincode, setPincode] = useState(buyerPincode || '')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [quote, setQuote] = useState(null)
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [orderId, setOrderId] = useState(null)

  function buildPayload() {
    const payload = { commodity, order_demand_kg: Number(quantity) }
    if (pincode.trim()) payload.buyer_pincode = pincode.trim()
    else payload.distance_km = 150
    return payload
  }

  async function handleGetPrice(event) {
    event.preventDefault()
    setQuoteError('')
    setQuote(null)
    setOrderId(null)
    if (!(Number(quantity) > 0)) {
      setQuoteError('Enter a quantity greater than 0.')
      return
    }
    setQuoteLoading(true)
    try {
      const result = await fetchQuote(buildPayload())
      setQuote(result)
    } catch (error) {
      setQuoteError(error.message || 'Could not get a price for this order.')
    } finally {
      setQuoteLoading(false)
    }
  }

  async function handleConfirm() {
    if (!buyerId) {
      setOrderError('Sign in as a buyer to place an order.')
      return
    }
    setOrderError('')
    setOrderLoading(true)
    try {
      const result = await placeOrder({ ...buildPayload(), buyer_id: buyerId })
      setOrderId(result.order_id)
    } catch (error) {
      setOrderError(error.message || 'Could not place this order.')
    } finally {
      setOrderLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="buyer-category-modal" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title">
        <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">{commodityIcon(commodity)} GET A PRICE</p>
        <h2 id="quote-modal-title">{commodity}</h2>

        <form onSubmit={handleGetPrice} className="form-grid" style={{ marginTop: 16 }}>
          <label>Quantity (kg)
            <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          <label>Your pincode
            <input type="text" inputMode="numeric" pattern="[0-9]{6}" placeholder="e.g. 500001" value={pincode} onChange={(event) => setPincode(event.target.value)} />
          </label>
          {quoteError && <p className="form-error" role="alert" style={{ gridColumn: '1 / -1' }}>{quoteError}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={quoteLoading} style={{ gridColumn: '1 / -1' }}>
            {quoteLoading ? 'Getting price…' : 'Get price'} <span>→</span>
          </button>
        </form>

        {quote && (
          <div style={{ marginTop: 22 }}>
            <QuoteBreakdown result={quote} />

            {orderId ? (
              <div className="summary-crop-card" style={{ background: '#eaf2df' }}>
                <strong>Order confirmed — #{orderId}</strong>
              </div>
            ) : (
              <>
                {orderError && <p className="form-error" role="alert">{orderError}</p>}
                <button className="button button-primary submit-button" onClick={handleConfirm} disabled={orderLoading}>
                  {orderLoading ? 'Placing order…' : 'Confirm order'} <span>→</span>
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default function BulkBuyerDashboard({ user, buyerProfile, language, setLanguage, onLogout }) {
  const t = useTranslation(language)
  const [commodities, setCommodities] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [selectedCommodity, setSelectedCommodity] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchCommodities()
      .then((data) => { if (!cancelled) setCommodities(data.commodities || []) })
      .catch((error) => { if (!cancelled) setLoadError(error.message || 'Could not load the catalog.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const searchTerm = search.trim().toLowerCase()
  const filtered = useMemo(
    () => commodities
      .filter((c) => activeCategory === 'All' || commodityCategory(c) === activeCategory)
      .filter((c) => !searchTerm || c.toLowerCase().includes(searchTerm)),
    [commodities, searchTerm, activeCategory],
  )

  const initials = (user.name || 'B').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'B'

  return (
    <div className="buyer-shell">
      <header className="buyer-topbar">
        <div className="brand buyer-brand">
          <span className="brand-mark">✦</span>
          <span>Farm<span>Direct</span></span>
        </div>

        <div className="buyer-search">
          <span className="buyer-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search commodities…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search commodities"
          />
        </div>

        <div className="buyer-topbar-actions">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
          <div className="buyer-profile">
            <div className="buyer-avatar" aria-hidden="true">{initials}</div>
            <div className="buyer-profile-info">
              <strong>{user.name || 'Buyer'}</strong>
              <span>{buyerProfile?.pincode ? `PIN ${buyerProfile.pincode}` : 'Add your pincode'}</span>
            </div>
            <button className="text-link buyer-logout" onClick={onLogout}>{t.logout}</button>
          </div>
        </div>
      </header>

      <nav className="buyer-filter-row" aria-label="Filter by category">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`buyer-filter-chip${activeCategory === category ? ' active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </nav>

      <main className="buyer-main">
        <div className="section-heading-row">
          <h3>{searchTerm ? `Results for "${search.trim()}"` : 'Browse commodities'}</h3>
        </div>
        {loading ? (
          <p className="buyer-loading">Loading catalog…</p>
        ) : loadError ? (
          <div className="empty-card"><p>{loadError}</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-card"><p>No commodities found.</p></div>
        ) : (
          <div className="buyer-product-grid">
            {filtered.map((commodity) => (
              <CommodityCard key={commodity} commodity={commodity} onSelect={setSelectedCommodity} />
            ))}
          </div>
        )}
      </main>

      {selectedCommodity && (
        <QuoteModal
          commodity={selectedCommodity}
          buyerId={user.id}
          buyerPincode={buyerProfile?.pincode}
          onClose={() => setSelectedCommodity(null)}
        />
      )}
    </div>
  )
}
