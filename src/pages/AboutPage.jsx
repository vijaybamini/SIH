import { Link, useOutletContext } from 'react-router-dom'

export default function AboutPage() {
  const { copy } = useOutletContext()

  return (
    <section className="mx-auto max-w-[820px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.challenge}</p>
      <h1 className="max-w-[620px] font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        {copy.mission}
      </h1>
      <p className="mt-5 text-[16px] leading-relaxed text-[var(--text-secondary)]">{copy.missionText}</p>

      <div className="mt-10 grid gap-6 text-[15px] leading-relaxed text-[var(--text-muted)]">
        <p>
          Farmers in India routinely lose a large share of their crop's real value to layers
          of middlemen between the field and the final buyer, while buyers pay prices that
          don't clearly reflect the produce's actual quality, freshness, or market value.
          F2C exists to close that gap — connecting farmers directly to bulk buyers,
          with a pricing engine that draws on real Agmarknet market data and live demand,
          not a haggled number set by whoever has the most leverage in the chain.
        </p>
        <p>
          The platform is built around one rule: every price shown is explainable. A farmer
          can see exactly why their crop is priced the way it is — real market data, current
          demand, nothing hidden. A buyer can see exactly where their payment goes — the
          crop's value to the farmer, and the real cost of getting it to them, with the
          platform's own commission taken only from the farmer's side and shown up front.
        </p>
        <p>
          Beyond pricing, F2C brings the rest of the supply chain onto the same
          platform: logistics providers who move the produce, and processing facilities who
          turn raw crops into market-ready goods — so the whole journey from farm to buyer
          happens in one connected system instead of a chain of disconnected middlemen.
        </p>
      </div>

      <p className="mt-10 text-[15px] leading-relaxed text-[var(--text-muted)]">
        Curious how it works in practice? See our{' '}
        <Link to="/how-it-works" className="font-semibold text-brand-600 hover:text-brand-700">step-by-step guide</Link>
        {' '}or{' '}
        <Link to="/services" className="font-semibold text-brand-600 hover:text-brand-700">explore the services</Link>
        {' '}available on the platform.
      </p>
    </section>
  )
}
