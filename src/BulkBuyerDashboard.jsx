import { useEffect, useMemo, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import Logo from './Logo'
import { useTranslation } from './i18n'
import { fetchCommodities, fetchQuote, placeOrder } from './api/aiBackend'

const CATEGORIES = ['All', 'Fruits', 'Vegetables', 'Grains', 'Pulses', 'Other']
const CATEGORY_ICONS = { All: '🛒', Fruits: '🍎', Vegetables: '🥦', Grains: '🌾', Pulses: '🫘', Other: '🌱' }
const QUANTITY_STEP_KG = 50
const MIN_QUANTITY_KG = 50

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

// Fixed-size media box: every commodity photo -- regardless of its own
// native resolution/aspect ratio -- renders at exactly the same pixel
// footprint, cropped to fill via object-cover instead of stretching or
// leaving mismatched whitespace.
function CommodityCard({ commodity, onSelect }) {
  const [imageFailed, setImageFailed] = useState(false)
  const [quantity, setQuantity] = useState(500)
  const imageUrl = COMMODITY_IMAGES[commodity]

  function adjustQuantity(delta) {
    setQuantity((prev) => Math.max(MIN_QUANTITY_KG, prev + delta))
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/[0.08]">
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-brand-50">
        {imageUrl && !imageFailed ? (
          <img className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-105" src={imageUrl} alt={commodity} loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="flex h-36 w-full items-center justify-center text-4xl" aria-hidden="true">{commodityIcon(commodity)}</div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--surface-raised)]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 shadow-sm">
          {commodityCategory(commodity)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h4 className="mb-1 min-h-[2.5em] text-sm font-bold leading-snug text-brand-900">{commodity}</h4>
        <span className="mb-3 text-xs font-semibold text-brand-400">Live pooled-demand pricing</span>

        <div className="mt-auto flex items-center justify-between gap-2 rounded-lg bg-cream-100 p-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-raised)] text-base font-bold text-brand-700 shadow-sm transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => adjustQuantity(-QUANTITY_STEP_KG)}
            disabled={quantity <= MIN_QUANTITY_KG}
          >
            −
          </button>
          <span className="text-xs font-bold tabular-nums text-brand-900">{quantity}kg</span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-raised)] text-base font-bold text-brand-700 shadow-sm transition-colors hover:bg-brand-100"
            onClick={() => adjustQuantity(QUANTITY_STEP_KG)}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="mt-2.5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          onClick={() => onSelect(commodity, quantity)}
        >
          Get price →
        </button>
      </div>
    </article>
  )
}

function freshnessSummary(allocations) {
  const dated = (allocations || []).filter((a) => a.harvest_date)
  if (dated.length === 0) return null
  const freshest = dated.reduce((best, a) => (a.harvest_date > best.harvest_date ? a : best))
  const anyUnharvested = dated.some((a) => !a.harvested)
  return {
    date: freshest.harvest_date,
    label: freshest.harvested ? 'Harvested on' : 'Expected harvest',
    mixed: anyUnharvested && dated.some((a) => a.harvested),
  }
}

function QuoteBreakdown({ result }) {
  const perKg = result.consumer_breakdown.per_kg_breakdown
  const orderTotals = result.consumer_breakdown.order_totals
  const market = result.consumer_breakdown.market_intelligence_metrics
  const freshness = freshnessSummary(result.allocations)
  const trendTone = /rising|up/i.test(market.macro_market_trend) ? 'text-[var(--color-error-ink)]'
    : /falling|down/i.test(market.macro_market_trend) ? 'text-brand-700' : 'text-[var(--text-muted)]'

  // These two lines sum to grand_total_to_pay exactly -- no hidden platform
  // markup is added on top (the platform's only cut is a commission taken
  // out of the farmer's crop-value share, never added to the buyer's price).
  const lineItems = [
    ['Crop value', money(orderTotals.total_crop_value)],
    ['Logistics cost', money(orderTotals.total_logistics_cost)],
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-cream-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[var(--border-subtle)] px-5 py-3.5">
        <strong className="text-sm font-bold text-brand-900">
          Order summary — {result.order_demand_kg}kg{result.requested_kg !== result.order_demand_kg ? ` (of ${result.requested_kg}kg requested)` : ''}
        </strong>
        <span className={`text-xs font-bold uppercase tracking-wide ${trendTone}`}>{market.macro_market_trend}</span>
      </div>

      <div className="grid gap-2 px-5 py-4">
        <div className="flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
          <span>Price per kg</span>
          <span className="tabular-nums text-brand-900">{money(perKg.final_checkout_price_per_kg)}</span>
        </div>
        {lineItems.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
            <span>{label}</span>
            <span className="tabular-nums text-brand-900">{value}</span>
          </div>
        ))}
        {freshness && (
          <div className="flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
            <span>Freshness</span>
            <span className="text-right text-brand-900">{freshness.label} {freshness.date}{freshness.mixed ? ' (some pre-booked)' : ''}</span>
          </div>
        )}
        <p className="mt-1 text-xs text-brand-400">Farmer receives {money(orderTotals.total_farmer_payout)} of the crop value — no middleman commission.</p>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-brand-50 px-5 py-3.5">
        <span className="text-sm font-bold text-brand-900">Total to pay</span>
        <strong className="font-display text-xl font-semibold text-brand-900">{money(orderTotals.grand_total_to_pay)}</strong>
      </div>
    </div>
  )
}

function formatCardNumber(value) {
  return value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

const buyerInputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-brand-900 outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const buyerLabelClass = 'grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]'

function PaymentForm({ amount, onPay, paying, error }) {
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  const isValid = cardNumber.replace(/\s/g, '').length === 16
    && cardName.trim().length > 1
    && /^\d{2}\/\d{2}$/.test(expiry)
    && cvv.length === 3

  function handleSubmit(event) {
    event.preventDefault()
    if (isValid) onPay()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs font-semibold text-brand-700">🔒 Test mode — no real charge will be made</div>
      <div className="flex items-center justify-between rounded-xl bg-cream-100 px-4 py-3.5">
        <span className="text-sm text-[var(--text-muted)]">Amount to pay</span>
        <strong className="font-display text-xl font-semibold text-brand-900">{money(amount)}</strong>
      </div>
      <label className={buyerLabelClass}>Card number
        <input
          className={buyerInputClass}
          type="text" inputMode="numeric" placeholder="4242 4242 4242 4242"
          value={cardNumber} onChange={(event) => setCardNumber(formatCardNumber(event.target.value))} required
        />
      </label>
      <label className={buyerLabelClass}>Name on card
        <input className={buyerInputClass} type="text" placeholder="AS ON CARD" value={cardName} onChange={(event) => setCardName(event.target.value.toUpperCase())} required />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className={buyerLabelClass}>Expiry
          <input className={buyerInputClass} type="text" inputMode="numeric" placeholder="MM/YY" value={expiry} onChange={(event) => setExpiry(formatExpiry(event.target.value))} required />
        </label>
        <label className={buyerLabelClass}>CVV
          <input className={buyerInputClass} type="password" inputMode="numeric" placeholder="•••" maxLength={3} value={cvv} onChange={(event) => setCvv(event.target.value.replace(/\D/g, '').slice(0, 3))} required />
        </label>
      </div>
      {error && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{error}</p>}
      <button className="rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={!isValid || paying}>
        {paying ? 'Processing payment…' : `Pay ${money(amount)}`} →
      </button>
    </form>
  )
}

function QuoteModal({ commodity, initialQuantity, buyerId, buyerPincode, onClose }) {
  const [quantity, setQuantity] = useState(String(initialQuantity || 500))
  const [pincode, setPincode] = useState(buyerPincode || '')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [quote, setQuote] = useState(null)
  const [checkoutStage, setCheckoutStage] = useState('quote') // 'quote' | 'payment' | 'done'
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
    setCheckoutStage('quote')
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

  async function handlePay() {
    if (!buyerId) {
      setOrderError('Sign in as a buyer to place an order.')
      return
    }
    setOrderError('')
    setOrderLoading(true)
    try {
      // Dummy gateway: simulate processing time, no card data is sent anywhere.
      await new Promise((resolve) => setTimeout(resolve, 1400))
      const result = await placeOrder({ ...buildPayload(), buyer_id: buyerId })
      setOrderId(result.order_id)
      setCheckoutStage('done')
    } catch (error) {
      setOrderError(error.message || 'Could not place this order.')
    } finally {
      setOrderLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto bg-brand-900/45 px-4 py-8" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="relative w-full max-w-[480px] rounded-2xl bg-[var(--surface-raised)] p-8 shadow-2xl shadow-brand-900/25" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title">
        <button className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xl text-[var(--text-muted)] hover:text-brand-700" aria-label="Close" onClick={onClose}>×</button>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-400">{commodityIcon(commodity)} Get a price</p>
        <h2 id="quote-modal-title" className="font-display text-2xl font-semibold text-brand-900">{commodity}</h2>

        <form onSubmit={handleGetPrice} className="mt-5 grid grid-cols-2 gap-4">
          <label className={buyerLabelClass}>Quantity (kg)
            <input className={buyerInputClass} type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          <label className={buyerLabelClass}>Your pincode
            <input className={buyerInputClass} type="text" inputMode="numeric" pattern="[0-9]{6}" placeholder="e.g. 500001" value={pincode} onChange={(event) => setPincode(event.target.value)} />
          </label>
          {quoteError && <p className="col-span-2 rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-ink)]" role="alert">{quoteError}</p>}
          <button className="col-span-2 rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={quoteLoading}>
            {quoteLoading ? 'Getting price…' : 'Get price'} →
          </button>
        </form>

        {quote && checkoutStage === 'quote' && (
          <div className="mt-5 flex flex-col gap-4">
            <QuoteBreakdown result={quote} />
            <button className="rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700" onClick={() => setCheckoutStage('payment')}>
              Proceed to payment →
            </button>
          </div>
        )}

        {quote && checkoutStage === 'payment' && (
          <div className="mt-5 flex flex-col gap-3">
            <PaymentForm
              amount={quote.consumer_breakdown.order_totals.grand_total_to_pay}
              onPay={handlePay}
              paying={orderLoading}
              error={orderError}
            />
            <button type="button" className="text-sm font-semibold text-brand-700 hover:text-brand-600" onClick={() => setCheckoutStage('quote')} disabled={orderLoading}>
              ← Back
            </button>
          </div>
        )}

        {checkoutStage === 'done' && (
          <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-cream-100 p-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-3xl text-brand-600" aria-hidden="true">✓</div>
            <strong className="block text-lg font-bold text-brand-900">Payment successful</strong>
            <span className="mt-1 block text-sm text-[var(--text-muted)]">Order confirmed — #{orderId}</span>
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
  const [selection, setSelection] = useState(null)

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
    <div className="min-h-screen bg-cream-200 font-sans text-[15px] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-4 px-8 py-4">
          <Logo />

          <div className="hidden shrink-0 flex-col leading-tight lg:flex">
            <span className="text-[10px] font-bold uppercase tracking-wide text-brand-400">Deliver bulk orders to</span>
            <span className="flex items-center gap-1 text-sm font-bold text-brand-900">
              <span aria-hidden="true">📍</span> {buyerProfile?.pincode ? `PIN ${buyerProfile.pincode}` : 'Add your pincode'}
            </span>
          </div>

          <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-full border border-[var(--border-subtle)] bg-cream-100 px-4 py-2.5 focus-within:border-brand-400">
            <span className="text-brand-400" aria-hidden="true">⌕</span>
            <input
              type="search"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Search for rice, wheat, mangoes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search commodities"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3.5">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="flex items-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-300 text-sm font-bold text-brand-900" aria-hidden="true">{initials}</div>
              <div className="hidden flex-col leading-tight sm:flex">
                <strong className="text-sm text-brand-900">{user.name || 'Buyer'}</strong>
                <span className="text-xs font-semibold text-brand-400">Bulk buyer</span>
              </div>
              <button className="ml-1 text-xs font-bold text-brand-800 hover:text-brand-600" onClick={onLogout}>{t.logout}</button>
            </div>
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1240px] gap-2 overflow-x-auto px-8 pb-4" aria-label="Filter by category">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                activeCategory === category ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--border-subtle)] bg-cream-100 text-brand-900 hover:border-brand-300'
              }`}
              onClick={() => setActiveCategory(category)}
            >
              <span aria-hidden="true">{CATEGORY_ICONS[category]}</span> {category}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-8 py-7">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-bold text-brand-900">
            {searchTerm ? `Results for "${search.trim()}"` : 'Browse commodities'}
          </h3>
          {!loading && !loadError && <span className="text-sm font-semibold text-brand-400">{filtered.length} available</span>}
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading catalog…</p>
        ) : loadError ? (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">{loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-cream-100 p-7 text-center text-brand-900">No commodities found.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((commodity) => (
              <CommodityCard key={commodity} commodity={commodity} onSelect={(name, quantity) => setSelection({ commodity: name, quantity })} />
            ))}
          </div>
        )}
      </main>

      {selection && (
        <QuoteModal
          commodity={selection.commodity}
          initialQuantity={selection.quantity}
          buyerId={user.id}
          buyerPincode={buyerProfile?.pincode}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  )
}
