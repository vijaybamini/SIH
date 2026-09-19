import { Link, useOutletContext } from 'react-router-dom'

export default function ServicesOverviewPage() {
  const { copy, serviceOfferings } = useOutletContext()

  return (
    <section className="mx-auto max-w-[1172px] px-6 py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.navServices}</p>
      <h1 className="max-w-[560px] font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
        One platform, four ways to take part
      </h1>
      <p className="mt-4 max-w-[640px] text-[15px] leading-relaxed text-[var(--text-muted)]">
        FarmDirect connects the whole crop journey — from the field to the buyer's
        doorstep — under one roof. Pick the role that matches what you do, and see
        exactly how the platform works for you.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {serviceOfferings.map((service) => (
          <Link
            to={`/services/${service.id}`}
            key={service.id}
            className="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-900/[0.08]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-3xl" aria-hidden="true">{service.icon}</span>
            <h2 className="mt-5 mb-2 font-display text-xl font-semibold tracking-tight text-brand-900">{service.title}</h2>
            <p className="mb-6 flex-1 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{service.desc}</p>
            <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-600">
              See how it works for {service.title} <span>→</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
