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

/**
 * Group array items by key selector.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} getKey
 * @returns {Record<string, T[]>}
 */
export function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

/**
 * Trigger a download for a Blob in the browser.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
