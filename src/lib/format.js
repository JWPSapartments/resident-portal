// Formatting helpers. Confirmation codes are produced by the backend
// (record_payment / seed) and only displayed by the frontend — no generator here.

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(n) {
  const value = Number(n)
  if (n == null || Number.isNaN(value)) return '$0.00'
  return currency.format(value)
}

export function formatDate(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
