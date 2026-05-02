// src/components/ui.jsx
// ChurnGuard shared UI primitives.
// All components use CSS variables — no hardcoded colours.

import React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { riskBg, riskColor } from '../utils/helpers'

/* ─── Card ─────────────────────────────────────────────────────────────────── */
export function Card({ children, className = '', style = {}, onClick }) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        transition: 'border-color 0.2s',
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
      onMouseEnter={onClick ? (e) => (e.currentTarget.style.borderColor = 'var(--border-hover)') : undefined}
      onMouseLeave={onClick ? (e) => (e.currentTarget.style.borderColor = 'var(--border)') : undefined}
    >
      {children}
    </div>
  )
}

/* ─── SectionTitle ──────────────────────────────────────────────────────────── */
export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginTop: '0.2rem',
            fontFamily: 'var(--font-body)',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

/* ─── Button ───────────────────────────────────────────────────────────────── */
export function Button({
  children,
  loading,
  disabled,
  variant = 'primary',
  size = 'md',
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '0.375rem 0.75rem', fontSize: '0.8125rem' },
    md: { padding: '0.625rem 1.25rem', fontSize: '0.875rem' },
    lg: { padding: '0.875rem 1.75rem', fontSize: '1rem' },
  }
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: '#080b10',
      border: 'none',
      fontWeight: 700,
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    },
    secondary: {
      background: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border)',
    },
    danger: {
      background: 'var(--danger)',
      color: '#fff',
      border: 'none',
      fontWeight: 700,
    },
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
        opacity: disabled || loading ? 0.55 : 1,
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.01em',
        transition: 'opacity 0.15s, transform 0.1s',
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      )}
      {children}
    </button>
  )
}

/* ─── RiskBadge ────────────────────────────────────────────────────────────── */
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
        border: `1px solid ${riskColor(tier)}50`,
        borderRadius: '99px',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
      }}
    >
      <span
        style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: riskColor(tier),
          display: 'inline-block',
          boxShadow: `0 0 6px ${riskColor(tier)}`,
        }}
      />
      {tier} Risk
    </span>
  )
}

/* ─── Spinner ───────────────────────────────────────────────────────────────── */
export function Spinner({ size = 24, color = 'var(--accent)' }) {
  return (
    <Loader2
      size={size}
      color={color}
      style={{ animation: 'spin 0.8s linear infinite', display: 'block' }}
    />
  )
}

/* ─── ErrorBox ──────────────────────────────────────────────────────────────── */
export function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        background: 'var(--risk-high-bg)',
        border: '1px solid var(--risk-high)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--risk-high)',
        fontSize: '0.8125rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
      }}
    >
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div>
        <strong>Error:</strong> {message}
      </div>
    </div>
  )
}

/* ─── FormRow ───────────────────────────────────────────────────────────────── */
export function FormRow({ label, children, tip }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <label
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </label>
      {children}
      {tip && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tip}</span>
      )}
    </div>
  )
}

/* ─── StatPill ──────────────────────────────────────────────────────────────── */
export function StatPill({ label, value, color = 'var(--accent)' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.375rem 0.75rem',
        background: `${color}12`,
        border: `1px solid ${color}30`,
        borderRadius: '99px',
        fontSize: '0.8rem',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</span>
    </div>
  )
}
