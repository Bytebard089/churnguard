// src/utils/helpers.js

export const fmtPct = (v) =>
  v != null ? `${(v * 100).toFixed(1)}%` : '—'

export const fmtCurrency = (v) =>
  v != null ? `$${Number(v).toFixed(2)}` : '—'

export const fmtMs = (v) =>
  v != null ? `${Number(v).toFixed(0)} ms` : '—'

/**
 * Returns the CSS color variable string for a risk tier.
 * @param {'High'|'Medium'|'Low'} tier
 */
export function riskColor(tier) {
  if (tier === 'High') return 'var(--risk-high)'
  if (tier === 'Medium') return 'var(--risk-med)'
  return 'var(--risk-low)'
}

/**
 * Returns the CSS background color string for a risk tier badge.
 * @param {'High'|'Medium'|'Low'} tier
 */
export function riskBg(tier) {
  if (tier === 'High') return 'var(--risk-high-bg)'
  if (tier === 'Medium') return 'var(--risk-med-bg)'
  return 'var(--risk-low-bg)'
}

/**
 * Clamp a number between min and max.
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(str, len = 40) {
  return str.length > len ? str.slice(0, len) + '…' : str
}
