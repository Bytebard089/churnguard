export function fmtPct(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`
}

export function fmtCurrency(value) {
  return `$${Number(value).toFixed(2)}`
}

export function riskColor(tier) {
  const map = {
    High: 'var(--risk-high)',
    Medium: 'var(--risk-med)',
    Low: 'var(--risk-low)',
  }
  return map[tier] || 'var(--text-secondary)'
}

export function riskBg(tier) {
  const map = {
    High: 'var(--risk-high-bg)',
    Medium: 'var(--risk-med-bg)',
    Low: 'var(--risk-low-bg)',
  }
  return map[tier] || 'transparent'
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function truncate(str, maxLen = 30) {
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str
}

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}
