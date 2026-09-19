import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { sendContactMessage } from '../api/aiBackend'

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]'

export default function ContactPage() {
  const { copy } = useOutletContext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('sending')
    setError('')
    try {
      await sendContactMessage({ name: name.trim(), email: email.trim(), message: message.trim() })
      setStatus('sent')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Could not send your message. Please try again.')
    }
  }

  return (
    <section className="mx-auto grid max-w-[1000px] gap-12 px-6 py-16 md:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[1.6px] text-brand-400">{copy.contactUs}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-brand-900 text-wrap-balance">
          Get in touch
        </h1>
        <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-[var(--text-muted)]">
          Questions about pricing, an order, or the platform in general — send us a message
          and we'll get back to you by email.
        </p>
        <div className="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Email us directly</p>
          <a href="mailto:dhomavivek2005@gmail.com" className="mt-1.5 block text-[15px] font-semibold text-brand-700 hover:text-brand-600">
            dhomavivek2005@gmail.com
          </a>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 self-start rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
        {status === 'sent' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl text-brand-600" aria-hidden="true">✓</span>
            <strong className="text-base font-bold text-brand-900">Message sent</strong>
            <p className="text-sm text-[var(--text-muted)]">Thanks for reaching out — we'll reply by email soon.</p>
            <button type="button" className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => setStatus('idle')}>
              Send another message
            </button>
          </div>
        ) : (
          <>
            <label className={labelClass}>Name
              <input className={inputClass} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className={labelClass}>Email
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className={labelClass}>Message
              <textarea className={`${inputClass} min-h-[140px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} required />
            </label>
            {status === 'error' && (
              <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-3 py-2.5 text-xs text-[var(--color-error-ink)]" role="alert">{error}</p>
            )}
            <button
              type="submit"
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </>
        )}
      </form>
    </section>
  )
}
