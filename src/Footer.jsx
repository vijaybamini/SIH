import { Link } from 'react-router-dom'
import Logo from './Logo'

const columnHeading = 'mb-4 text-xs font-bold uppercase tracking-[1.2px] text-brand-400'
const footerLink = 'text-[14.5px] font-medium text-brand-800 transition-colors hover:text-brand-600'

export default function Footer({ copy }) {
  const year = new Date().getFullYear()

  const serviceLinks = [
    { key: 'farmers', label: copy.svcFarmers, to: '/services/farmers' },
    { key: 'marketplace', label: copy.svcMarketplace, to: '/services/marketplace' },
    { key: 'processing-unit', label: copy.svcProcessing, to: '/services/processing-unit' },
    { key: 'logistics', label: copy.svcLogistics, to: '/services/logistics' },
  ]

  const companyLinks = [
    { key: 'about', label: copy.navAbout, to: '/about' },
    { key: 'how-it-works', label: copy.navHow, to: '/how-it-works' },
  ]

  const supportLinks = [
    { key: 'faq', label: copy.faq, to: '/faq' },
    { key: 'policy', label: copy.policy, to: '/policy' },
    { key: 'terms', label: copy.termsConditions, to: '/terms' },
    { key: 'contact', label: copy.contactUs, to: '/contact' },
  ]

  return (
    <footer className="mt-16 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo to="/" />
          <p className="mt-4 max-w-[280px] text-[14.5px] leading-relaxed text-[var(--text-muted)]">
            {copy.hero}
          </p>
        </div>

        <div>
          <p className={columnHeading}>{copy.navServices}</p>
          <ul className="grid gap-3">
            {serviceLinks.map((link) => (
              <li key={link.key}><Link className={footerLink} to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <p className={columnHeading}>Company</p>
          <ul className="grid gap-3">
            {companyLinks.map((link) => (
              <li key={link.key}><Link className={footerLink} to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <p className={columnHeading}>Support</p>
          <ul className="grid gap-3">
            {supportLinks.map((link) => (
              <li key={link.key}><Link className={footerLink} to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] px-6 py-5">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 text-xs font-medium text-[var(--text-muted)]">
          <span>© {year} FarmDirect. All rights reserved.</span>
          <span>Built for Smart India Hackathon 2026.</span>
        </div>
      </div>
    </footer>
  )
}
