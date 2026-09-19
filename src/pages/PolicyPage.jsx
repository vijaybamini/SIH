import { Link, useOutletContext } from 'react-router-dom'

const SECTIONS = [
  {
    title: 'What we collect',
    body: 'Account details you provide when registering (name, phone or email, role, and role-specific profile details such as farm location and crop list, vehicle details, or business/GST details). We do not collect data beyond what\'s needed to run your account and complete transactions.',
  },
  {
    title: 'How it\'s used',
    body: 'Your profile data is used to run the core features you signed up for: pricing your crops, matching buyers with supply, routing logistics, and displaying your account back to you. It is not sold or shared with unrelated third parties.',
  },
  {
    title: 'Where it\'s stored',
    body: 'Account and profile data is stored in Supabase (PostgreSQL), protected by row-level security policies so only you — and, where a transaction requires it, the other party involved — can access your data.',
  },
  {
    title: 'Third parties we use',
    body: 'Resend is used to deliver login codes and other transactional emails. Market pricing is calculated from Agmarknet\'s public commodity price data, which is aggregate market information, not personal data about you.',
  },
  {
    title: 'Your choices',
    body: 'You can update your profile details (including your email) at any time from your dashboard. To request access to, correction of, or deletion of your data, contact us using the details on our Contact page.',
  },
]

export default function PolicyPage() {
  const { copy } = useOutletContext()

  return (
    <section className="mx-auto max-w-[760px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.policy}</p>
      <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        Privacy &amp; data policy
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

      <p className="mt-10 text-[15px] leading-relaxed text-[var(--text-muted)]">
        Questions about this policy? <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">Get in touch</Link>.
      </p>
    </section>
  )
}
