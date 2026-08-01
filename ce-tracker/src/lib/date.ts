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

/** Horodatage à enregistrer : la date choisie, à l'heure donnée (ou l'heure actuelle). */
export function horodatage(date: string, hhmm?: string): string {
  const [h, m] = (hhmm ?? new Date().toTimeString().slice(0, 5)).split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

/** Heure d'un horodatage, en local, sans les secondes. */
export function heureDe(at: string): string {
  return new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Valeur locale pour un input datetime-local, à partir d'un horodatage ISO. */
export function datetimeLocalDe(at: string): string {
  const d = new Date(at)
  const offset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

/** Horodatage ISO à partir de la valeur locale (sans fuseau) d'un input datetime-local. */
export function isoDeDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}
