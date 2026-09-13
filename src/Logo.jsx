export default function Logo({ href, className = 'brand', label = 'FarmDirect' }) {
  const content = (
    <>
      <span className="brand-mark">✦</span>
      <span>Farm<span>Direct</span></span>
    </>
  )

  if (href) {
    return (
      <a className={className} href={href} aria-label={label}>
        {content}
      </a>
    )
  }

  return (
    <span className={className} role="img" aria-label={label}>
      {content}
    </span>
  )
}