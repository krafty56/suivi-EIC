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

/** « 3 févr. 25 » à partir d'une date YYYY-MM-DD : pour les mesures de
 * laboratoire, qui se comparent souvent d'une année sur l'autre — contrairement
 * aux graphiques d'Analyses, toujours bornés à une période explicite. */
export function formatShortDateAvecAnnee(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
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

/** Jour précédent une date YYYY-MM-DD. */
export function veilleDe(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Nombre de jours entiers entre une date YYYY-MM-DD et aujourd'hui. */
export function joursDepuis(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const debut = new Date(y, m - 1, d)
  const [ty, tm, td] = todayISO().split('-').map(Number)
  const fin = new Date(ty, tm - 1, td)
  return Math.round((fin.getTime() - debut.getTime()) / 86_400_000)
}

/** Âge en années révolues à partir d'une date de naissance YYYY-MM-DD :
 * recalculé à la volée plutôt que saisi, il ne se périme jamais. */
export function calculerAge(dateNaissance: string): number {
  const [y, m, d] = dateNaissance.split('-').map(Number)
  const naissance = new Date(y, m - 1, d)
  const aujourdhui = new Date()
  let age = aujourdhui.getFullYear() - naissance.getFullYear()
  const avantAnniversaire =
    aujourdhui.getMonth() < naissance.getMonth() ||
    (aujourdhui.getMonth() === naissance.getMonth() && aujourdhui.getDate() < naissance.getDate())
  if (avantAnniversaire) age -= 1
  return age
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
