import React from 'react'
import { Loader2 } from 'lucide-react'
import { riskBg, riskColor } from '../utils/helpers'

export function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700 }}>{children}</h2>
      {sub ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</p> : null}
    </div>
  )
}

export function Button({ children, loading, disabled, variant = 'primary', size = 'md', style = {}, ...rest }) {
  const sizes = {
    sm: { padding: '0.375rem 0.75rem', fontSize: '0.8125rem' },
    md: { padding: '0.625rem 1.25rem', fontSize: '0.875rem' },
    lg: { padding: '0.875rem 1.75rem', fontSize: '1rem' },
  }
  const variants = {
    primary: { background: 'var(--accent)', color: '#0a0b0e', border: 'none' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
    secondary: { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    danger: { background: 'var(--danger)', color: '#fff', border: 'none' },
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      style={{
        ...sizes[size],
        ...variants[variant],
        borderRadius: 'var(--radius-md)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
      {children}
    </button>
  )
}

export function RiskBadge({ tier, size = 'md' }) {
  const sizes = {
    sm: { fontSize: '0.6875rem', padding: '0.2rem 0.5rem' },
    md: { fontSize: '0.75rem', padding: '0.3rem 0.75rem' },
    lg: { fontSize: '0.875rem', padding: '0.4rem 0.875rem' },
  }
  return (
    <span
      style={{
        ...sizes[size],
        background: riskBg(tier),
        color: riskColor(tier),
        border: `1px solid ${riskColor(tier)}`,
        borderRadius: '99px',
      }}
    >
      {tier} Risk
    </span>
  )
}

export function Spinner({ size = 20 }) {
  return <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
}

export function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', color: 'var(--danger)', marginTop: '0.75rem' }}>
      {message}
    </div>
  )
}

export function StatCell({ label, value, sub, accent = false }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.375rem', textTransform: 'uppercase' }}>{label}</div>
      {sub ? <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div> : null}
    </div>
  )
}

export function Divider({ style = {} }) {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', ...style }} />
}
