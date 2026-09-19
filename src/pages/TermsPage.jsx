import { useOutletContext } from 'react-router-dom'

const SECTIONS = [
  {
    title: 'Accounts & eligibility',
    body: 'You must provide accurate information when registering, and keep your profile (crop lists, vehicle or facility details, contact information) up to date. Each account is registered under a single role — Farmer, Bulk Buyer, Logistics, or Service Provider.',
  },
  {
    title: 'How pricing works',
    body: 'Prices shown on FarmDirect are calculated from real market data and current pooled demand, and can change as market conditions or demand change. FarmDirect does not guarantee a fixed price for any commodity — the price at the time an order is placed is the price that applies to that order.',
  },
  {
    title: 'Commission & fees',
    body: 'FarmDirect charges a platform commission, taken only from the farmer\'s crop-value share and shown transparently on every quote. Logistics cost is passed through to the buyer at the logistics provider\'s quoted rate, with no markup added by the platform.',
  },
  {
    title: 'Responsibilities',
    body: 'Farmers are responsible for the accuracy of crop listings and for fulfilling orders placed against their supply. Buyers are responsible for providing accurate delivery details. Logistics and service providers are responsible for the accuracy of their registered vehicle, storage, or facility details.',
  },
  {
    title: 'Disputes',
    body: 'If an order doesn\'t go as expected, contact us with the order details and we\'ll help resolve it. FarmDirect acts as the platform connecting the parties in a transaction; it is not itself a party to the underlying sale of goods between farmer and buyer.',
  },
  {
    title: 'Changes to these terms',
    body: 'These terms may be updated as the platform evolves. Continued use of FarmDirect after an update means you accept the revised terms.',
  },
]

export default function TermsPage() {
  const { copy } = useOutletContext()

  return (
    <section className="mx-auto max-w-[760px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.termsConditions}</p>
      <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        Terms &amp; conditions
      </h1>
      <p className="mt-4 text-[14px] text-[var(--text-muted)]">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}</p>

      <div className="mt-10 grid gap-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-2 font-display text-lg font-semibold text-brand-900">{section.title}</h2>
            <p className="text-[14.5px] leading-relaxed text-[var(--text-muted)]">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
