import { useEffect, useState } from 'react'
import { validatePincode } from './api/aiBackend'

export const PINCODE_PATTERN = /^(?!(\d)\1{5}$)[1-9][0-9]{5}$/

export default function PincodeHint({ pincode, t }) {
  const [state, setState] = useState({ status: 'idle' })

  useEffect(() => {
    if (!PINCODE_PATTERN.test(String(pincode || '').trim())) {
      setState({ status: 'idle' })
      return undefined
    }
    let cancelled = false
    setState({ status: 'checking' })
    const timer = setTimeout(async () => {
      try {
        const data = await validatePincode(pincode.trim())
        if (cancelled) return
        setState(data.valid
          ? { status: 'ok', label: [data.district, data.state].filter(Boolean).join(', ') }
          : { status: 'warn' })
      } catch {
        if (!cancelled) setState({ status: 'idle' })
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [pincode])

  if (state.status === 'checking') return <small className="text-[13px] text-[var(--text-muted)]">{t.checkingPincode}</small>
  if (state.status === 'ok') return <small className="text-[13px] font-medium text-brand-600">✓ {state.label}</small>
  if (state.status === 'warn') return <small className="text-[13px] font-medium text-[var(--color-error)]">{t.validationPincodeUnknown}</small>
  return null
}
