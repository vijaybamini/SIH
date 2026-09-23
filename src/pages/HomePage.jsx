import { useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

export default function HomePage() {
  const { t, copy, setPanel, serviceOfferings } = useOutletContext()
  const heroVideoRef = useRef(null)

  useEffect(() => {
    // Some browsers ignore the `autoplay` attribute on a video that wasn't
    // already in the initial document (React inserts it after mount), even
    // when muted -- calling play() explicitly once the element exists covers
    // that gap without affecting browsers where autoplay already worked.
    heroVideoRef.current?.play().catch(() => {})
  }, [])

  return (
    <>
      <section className="mx-auto grid max-w-[1240px] items-center gap-16 px-6 py-14 md:grid-cols-2 md:py-20">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
            F2C <span className="text-brand-400" aria-hidden="true">—</span> Farmer to Consumer
          </p>
          <h1 className="max-w-[600px] font-display text-[clamp(40px,5vw,64px)] font-semibold leading-[1.05] tracking-tight text-brand-900 text-wrap-balance">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-[500px] text-base leading-relaxed text-[var(--text-secondary)]">{copy.hero}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <button
              className="inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-8 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(63,143,95,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(63,143,95,0.5)]"
              onClick={() => setPanel('register')}
            >
              {copy.join} <span>→</span>
            </button>
          </div>
        </div>
        <div className="relative aspect-video max-h-[340px] overflow-hidden rounded-[23%_8%_25%_8%] bg-brand-100 shadow-inner" aria-label={t.heroIllustrationLabel}>
          <video
            ref={heroVideoRef}
            className="block h-full w-full object-cover"
            src="/F2C_Main_page_intro.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1172px] px-6 pb-16">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.navServices}</p>
          <Link to="/services" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            View all services →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {serviceOfferings.map((service) => (
            <Link
              to={`/services/${service.id}`}
              className="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-900/[0.08]"
              key={service.id}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden="true">{service.icon}</span>
              <h3 className="mt-4 mb-2 font-display text-lg font-semibold tracking-tight text-brand-900">{service.title}</h3>
              <p className="mb-5 flex-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{service.desc}</p>
              <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-600">
                Learn more <span>→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mb-16 grid max-w-[1172px] items-center gap-12 rounded-3xl bg-brand-50 p-10 md:grid-cols-2 md:p-14">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.challenge}</p>
          <h2 className="max-w-[440px] font-display text-3xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">{copy.mission}</h2>
        </div>
        <div>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">{copy.missionText}</p>
          <Link to="/about" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
            More about our mission <span>→</span>
          </Link>
        </div>
      </section>
    </>
  )
}
