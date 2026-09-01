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

/** Résumé lisible du créneau d'une absence : les heures priment quand elles
 * sont renseignées — une absence dépasse rarement 24h/24 — sinon la ou les
 * dates seules décrivent une absence à la journée (week-end, voyage). */
export function formatPlageAbsence(absence: {
  date_debut: string
  date_fin: string | null
  heure_debut: string | null
  heure_fin: string | null
}): string {
  const heureDebut = formatTime(absence.heure_debut)
  const heureFin = formatTime(absence.heure_fin)
  const debut = heureDebut ? `${formatShortDate(absence.date_debut)} à ${heureDebut}` : formatShortDate(absence.date_debut)

  if (!absence.date_fin) return `Depuis le ${debut} · en cours`

  const memeJour = absence.date_fin === absence.date_debut
  if (memeJour && heureDebut && heureFin) {
    return `Le ${formatShortDate(absence.date_debut)} de ${heureDebut} à ${heureFin}`
  }
  if (memeJour && heureDebut) {
    return `Le ${formatShortDate(absence.date_debut)} à partir de ${heureDebut}`
  }

  const fin = heureFin ? `${formatShortDate(absence.date_fin)} à ${heureFin}` : formatShortDate(absence.date_fin)
  return `Du ${debut} au ${fin}`
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

/** Valeur locale pour un input datetime-local, à partir d'une Date dont les
 * champs (année, mois, jour, heure…) sont déjà la bonne heure locale — le
 * cas d'une date EXIF (DateTimeOriginal), qui n'a pas de fuseau et se lit
 * telle quelle. Contrairement à datetimeLocalDe, aucune conversion de fuseau
 * n'est appliquée : lire les champs locaux du Date suffit. */
export function datetimeLocalDeDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
