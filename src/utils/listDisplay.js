export function formatListDate(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date)
}
