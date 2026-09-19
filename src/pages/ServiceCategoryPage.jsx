import { Navigate, useOutletContext, useParams } from 'react-router-dom'

const SERVICE_CATEGORY_CONTENT = {
  farmers: {
    role: 'farmer',
    tagline: 'Sell your harvest at a fair, transparent price — no middlemen.',
    intro: [
      'FarmDirect prices your crop using real Agmarknet market data and current demand across every buyer on the platform, not a single haggled number from a middleman. The price you see is a live, market-driven rate that updates as demand does.',
      'When more than one buyer wants the same crop at the same time, the platform pools that demand so your price reflects real scarcity — the same way a real market clears, just without you having to negotiate it yourself.',
    ],
    benefits: [
      'Live, AI-assisted pricing based on real Agmarknet historical and forecasted prices',
      'A transparent payout: the platform takes its commission only from the crop-value share, never added on top for the buyer',
      'Track each crop from planting to harvest, with realistic harvest-cycle checks so dates stay honest',
      'List multiple crops and see your total expected portfolio value in one dashboard',
    ],
    steps: [
      'Register as a farmer and complete your profile with your farm size and location.',
      'Add each crop you grow, along with planted and expected harvest dates.',
      'FarmDirect shows you a live, pooled-demand price per crop — updated as buyer demand changes.',
      'When a buyer orders, you get paid your net price directly, with the exact commission shown up front.',
    ],
  },
  marketplace: {
    role: 'buyer',
    tagline: 'Source fresh produce in bulk, straight from verified farmers.',
    intro: [
      'The Marketplace is where bulk buyers — retailers, institutions, processors — order directly from the farmers already on FarmDirect, at a price set by real market data and pooled demand instead of a middleman\'s markup.',
      'Every quote is itemized before you pay: the crop value that goes to the farmer, and the logistics cost of getting it to you — nothing else is added on top.',
    ],
    benefits: [
      'Order any commodity in bulk with a live, quantity-aware price quote',
      'See exactly how much of your payment reaches the farmer and how much covers delivery',
      'Freshness information on every order — confirmed harvest date where available, expected date otherwise',
      'Delivery handled by logistics providers already on the platform',
    ],
    steps: [
      'Register as a bulk buyer and set your delivery pincode.',
      'Browse commodities and choose a quantity — pricing updates live as you adjust it.',
      'Review the itemized breakdown (crop value + logistics, no hidden fees) before you pay.',
      'Track your order through to delivery.',
    ],
  },
  'processing-unit': {
    role: 'service',
    tagline: 'List your processing facility and connect it to the crops it handles.',
    intro: [
      'Processing units — rice mills, oil mills, flour mills, and similar facilities — can register on FarmDirect with the crop types they process and their GST details, making their capacity visible on the platform.',
      'This is the newest part of FarmDirect and is intentionally simple today: register your facility and the crops you handle, with more direct farmer-to-processor matching planned as the platform grows.',
    ],
    benefits: [
      'Register one or more mills/facilities, each with the specific crop types it processes',
      'Keep your GSTIN and supporting documents attached to your profile',
      'A single dashboard for all your registered facilities',
    ],
    steps: [
      'Register as a service provider and complete your business profile.',
      'Add each mill or facility you operate, with the crop types it processes and GSTIN.',
      'Your facility becomes part of FarmDirect\'s network of processing capacity.',
    ],
  },
  logistics: {
    role: 'logistics',
    tagline: 'Offer transport and delivery services for real, priced-in trips.',
    intro: [
      'Logistics providers move crops from farm to buyer. FarmDirect factors real logistics cost into every quote — the freight you\'re paid is passed through to the buyer at your quoted rate, with no platform markup taken on top of it.',
      'Register your vehicles or your storage/inventory capacity, and manage trip and storage details from one dashboard.',
    ],
    benefits: [
      'Register vehicles with type and registration details for transport work',
      'Or register storage/inventory capacity if you operate a warehouse instead',
      'Freight is passed through at your quoted price — never marked up for the buyer',
    ],
    steps: [
      'Register as a logistics provider and complete your profile.',
      'Choose whether you offer transport (vehicles) or storage (inventory), and add your details.',
      'Accept trip or storage requests as they come in from your dashboard.',
    ],
  },
}

export default function ServiceCategoryPage() {
  const { categoryId } = useParams()
  const { copy, openRegister, serviceOfferings } = useOutletContext()
  const content = SERVICE_CATEGORY_CONTENT[categoryId]
  const offering = serviceOfferings.find((service) => service.id === categoryId)

  if (!content || !offering) {
    return <Navigate to="/services" replace />
  }

  return (
    <article className="mx-auto max-w-[860px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.navServices}</p>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-3xl" aria-hidden="true">{offering.icon}</span>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-900 sm:text-4xl">{offering.title}</h1>
      </div>
      <p className="mt-5 max-w-[560px] text-lg font-medium leading-relaxed text-brand-700">{content.tagline}</p>

      <div className="mt-8 grid gap-4">
        {content.intro.map((paragraph, index) => (
          <p key={index} className="text-[15px] leading-relaxed text-[var(--text-muted)]">{paragraph}</p>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
        <h2 className="mb-4 font-display text-lg font-semibold text-brand-900">What you get</h2>
        <ul className="grid gap-3">
          {content.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
              <span className="mt-1 text-brand-500" aria-hidden="true">✓</span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-brand-900">How it works</h2>
        <ol className="grid gap-4">
          {content.steps.map((step, index) => (
            <li key={index} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{index + 1}</span>
              <p className="text-[14.5px] leading-relaxed text-[var(--text-secondary)]">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <button
        className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-8 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(63,143,95,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(63,143,95,0.5)]"
        onClick={() => openRegister(content.role)}
      >
        Create {offering.title} account <span>→</span>
      </button>
    </article>
  )
}
