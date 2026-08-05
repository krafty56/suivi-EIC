import type { Appointment } from './types'

// Durée par défaut d'une consultation vétérinaire, faute d'heure de fin
// saisie nulle part dans l'app — le rendez-vous n'a qu'une heure de début.
const DUREE_PAR_DEFAUT_MIN = 60

function versUtcCompact(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function echapperIcs(texte: string): string {
  return texte.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Créneau du rendez-vous, au format attendu par .ics comme par l'URL Google
 * Calendar. Une heure connue donne un créneau d'une heure ; sans heure,
 * c'est une journée entière — le rendez-vous existe, l'horaire reste à
 * préciser sur place. */
function creneauRendezVous(r: Appointment): { debut: string; fin: string; journeeEntiere: boolean } {
  if (!r.heure) {
    const finDate = new Date(`${r.date}T00:00:00`)
    finDate.setDate(finDate.getDate() + 1)
    return {
      debut: r.date.replace(/-/g, ''),
      fin: finDate.toISOString().slice(0, 10).replace(/-/g, ''),
      journeeEntiere: true,
    }
  }
  const [h, m] = r.heure.slice(0, 5).split(':').map(Number)
  const debutDate = new Date(`${r.date}T00:00:00`)
  debutDate.setHours(h, m, 0, 0)
  const finDate = new Date(debutDate)
  finDate.setMinutes(finDate.getMinutes() + DUREE_PAR_DEFAUT_MIN)
  return { debut: versUtcCompact(debutDate), fin: versUtcCompact(finDate), journeeEntiere: false }
}

/** Contenu .ics du rendez-vous : Calendrier (iOS/macOS) et la plupart des
 * applications l'ouvrent nativement, en proposant directement d'ajouter
 * l'événement plutôt que d'en importer le fichier à la main. */
export function icsRendezVous(dog: { name: string }, r: Appointment): string {
  const { debut, fin, journeeEntiere } = creneauRendezVous(r)
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//appeic//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${r.id}@appeic.app`,
    `DTSTAMP:${versUtcCompact(new Date())}`,
    journeeEntiere ? `DTSTART;VALUE=DATE:${debut}` : `DTSTART:${debut}`,
    journeeEntiere ? `DTEND;VALUE=DATE:${fin}` : `DTEND:${fin}`,
    `SUMMARY:${echapperIcs(`${r.motif} — ${dog.name}`)}`,
  ]
  if (r.clinique) lignes.push(`LOCATION:${echapperIcs(r.clinique)}`)
  if (r.note) lignes.push(`DESCRIPTION:${echapperIcs(r.note)}`)
  lignes.push('END:VEVENT', 'END:VCALENDAR')
  return lignes.join('\r\n')
}

/** Déclenche le téléchargement du fichier .ics. */
export function telechargerIcs(nomFichier: string, contenu: string): void {
  const blob = new Blob([contenu], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

/** URL Google Calendar pré-remplie : ouvre l'app ou le site avec l'événement
 * prêt à enregistrer, sans jamais rien créer avant validation par
 * l'utilisateur. */
export function urlGoogleCalendar(dog: { name: string }, r: Appointment): string {
  const { debut, fin } = creneauRendezVous(r)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${r.motif} — ${dog.name}`,
    dates: `${debut}/${fin}`,
  })
  const details = [r.note, r.clinique ? `Clinique : ${r.clinique}` : null].filter(Boolean).join('\n\n')
  if (details) params.set('details', details)
  if (r.clinique) params.set('location', r.clinique)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
