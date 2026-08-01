/** Date du jour au format YYYY-MM-DD, dans le fuseau local. */
export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** « lundi 3 février 2025 » à partir d'une date YYYY-MM-DD. */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** « 3 févr. » à partir d'une date YYYY-MM-DD. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

/** « 08:00 » à partir d'une heure Postgres « 08:00:00 ». */
export function formatTime(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}
