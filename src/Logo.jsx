export default function Logo({ href, className = '', label = 'FarmDirect' }) {
  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 -rotate-6 items-center justify-center rounded-[10px_10px_10px_3px] bg-brand-600 text-base text-brand-100 shadow-sm shadow-brand-900/20">
        ✦
      </span>
      <span className="font-display text-[21px] font-semibold tracking-tight text-current">
        Farm<span className="text-brand-400">Direct</span>
      </span>
    </>
  )

  const base = `flex shrink-0 items-center gap-2.5 ${className}`

  if (href) {
    return (
      <a className={base} href={href} aria-label={label}>
        {content}
      </a>
    )
  }

  return (
    <span className={base} role="img" aria-label={label}>
      {content}
    </span>
  )
}
