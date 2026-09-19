import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

const FAQS = [
  {
    q: 'How is the price of my crop decided?',
    a: 'FarmDirect calculates price using real historical and forecasted Agmarknet market data for that commodity, adjusted for current demand pooled across every buyer wanting it right now. It is a live, market-driven number — not a price one buyer negotiates with you.',
  },
  {
    q: 'What does "pooled demand" mean?',
    a: 'If five buyers all want the same crop at the same time, the platform treats that as one combined demand against the available supply, the same way a real market would respond to that many buyers competing for a limited amount of produce. This keeps pricing fair to everyone, instead of the first buyer getting an artificially low price.',
  },
  {
    q: 'Does FarmDirect take a commission?',
    a: 'Yes, a percentage commission is taken, but only from the farmer\'s crop-value share — it is never added on top of what a buyer pays. Every quote shows the exact commission-adjusted amount the farmer receives.',
  },
  {
    q: 'How and when do farmers get paid?',
    a: 'When a buyer places an order, the farmer\'s payout is calculated at the exact per-kg rate shown for that order, minus the platform commission. That amount is shown to both sides before checkout — there\'s no separate negotiation after the fact.',
  },
  {
    q: 'Is my personal data secure?',
    a: 'Your account data is stored with Supabase and protected by row-level security so only you (and, where relevant, the other party in a transaction) can see it. See our full Privacy Policy for details on what\'s collected and how it\'s used.',
  },
  {
    q: 'Can I switch roles, or have more than one role?',
    a: 'Each account is registered under one role (Farmer, Bulk Buyer, Logistics, or Service Provider) based on what you signed up as. If you need a different role, you can register a separate account for it.',
  },
  {
    q: 'What languages does FarmDirect support?',
    a: 'The app interface is available in English, Hindi, Telugu, Tamil, Malayalam, Kannada, Marathi, and Bengali. You can change your language at any time from the language switcher in the header.',
  },
  {
    q: 'How do I log in without a password?',
    a: 'You can request a one-time 6-digit code sent to your registered email instead of using a password. It\'s sent by FarmDirect directly and expires after a short time for security.',
  },
  {
    q: 'How is delivery/logistics cost calculated?',
    a: 'Logistics cost is passed through to the buyer at exactly the rate quoted by the logistics provider handling that trip — FarmDirect does not add any markup on top of it.',
  },
]

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className="text-[15px] font-semibold text-brand-900">{item.q}</span>
        <span className={`shrink-0 text-lg text-brand-500 transition-transform ${isOpen ? 'rotate-45' : ''}`} aria-hidden="true">+</span>
      </button>
      {isOpen && (
        <p className="px-6 pb-5 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{item.a}</p>
      )}
    </div>
  )
}

export default function FaqPage() {
  const { copy } = useOutletContext()
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section className="mx-auto max-w-[760px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.faq}</p>
      <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        Frequently asked questions
      </h1>

      <div className="mt-10 grid gap-3">
        {FAQS.map((item, index) => (
          <FaqItem
            key={item.q}
            item={item}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex((current) => (current === index ? -1 : index))}
          />
        ))}
      </div>

      <p className="mt-10 text-[15px] leading-relaxed text-[var(--text-muted)]">
        Still have a question?{' '}
        <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">Contact us</Link>.
      </p>
    </section>
  )
}
