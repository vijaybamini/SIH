import { useOutletContext } from 'react-router-dom'

const TRACKS = [
  {
    key: 'farmers',
    title: 'For Farmers',
    icon: '🌱',
    steps: [
      { title: 'List your crops', text: 'Add each crop with its planted and expected harvest date. FarmDirect checks the dates against realistic harvest cycles for that crop.' },
      { title: 'Get a live price', text: 'Pricing comes from real Agmarknet market data plus current demand pooled across every buyer wanting that crop right now — not a single buyer\'s offer.' },
      { title: 'Get discovered', text: 'Bulk buyers see your crop as part of the platform\'s live supply the moment it\'s listed.' },
      { title: 'Get paid transparently', text: 'When an order is placed, you see your exact net payout — the platform\'s commission is a fixed share taken only from the crop value, never hidden.' },
    ],
  },
  {
    key: 'buyers',
    title: 'For Buyers',
    icon: '🏪',
    steps: [
      { title: 'Browse commodities', text: 'See everything currently available across all farmers on the platform, grouped by category.' },
      { title: 'Set a quantity', text: 'Pricing is quantity-aware and updates live — larger orders interact with real supply and pooled demand from other buyers.' },
      { title: 'Review an itemized quote', text: 'Every quote breaks down crop value and logistics cost separately, with the total before you commit to pay.' },
      { title: 'Track delivery', text: 'Your order is fulfilled by farmers and moved by logistics providers already on the platform, with freshness/harvest information attached.' },
    ],
  },
  {
    key: 'logistics-service',
    title: 'For Logistics & Service Providers',
    icon: '🚚',
    steps: [
      { title: 'Register your capacity', text: 'Logistics providers register vehicles or storage/inventory capacity. Service providers register processing facilities and the crop types they handle.' },
      { title: 'Get matched to real orders', text: 'Logistics providers see trip requests tied to real buyer orders, priced at your quoted freight rate.' },
      { title: 'No markup on your rate', text: 'Freight is passed through to the buyer exactly as quoted — the platform never adds a markup on top of your price.' },
      { title: 'Manage it all from one dashboard', text: 'Accept trips, update vehicle or inventory details, and track your activity in one place.' },
    ],
  },
]

export default function HowItWorksPage() {
  const { copy } = useOutletContext()

  return (
    <section className="mx-auto max-w-[1000px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.navHow}</p>
      <h1 className="max-w-[620px] font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        How FarmDirect actually works
      </h1>
      <p className="mt-4 max-w-[640px] text-[15px] leading-relaxed text-[var(--text-muted)]">
        The flow is different depending on which side of the platform you're on.
        Here's exactly what happens for each role, end to end.
      </p>

      <div className="mt-12 grid gap-14">
        {TRACKS.map((track) => (
          <div key={track.key}>
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden="true">{track.icon}</span>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-brand-900">{track.title}</h2>
            </div>
            <ol className="grid gap-5 sm:grid-cols-2">
              {track.steps.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{index + 1}</span>
                  <div>
                    <h3 className="mb-1.5 text-[15px] font-semibold text-brand-900">{step.title}</h3>
                    <p className="text-[13.5px] leading-relaxed text-[var(--text-muted)]">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
