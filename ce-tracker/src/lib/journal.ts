import { resumeDetailsEvenement } from '../data/catalogs'
import { emojiEvenement, EMOJI_POIDS } from '../data/emoji'
import { heureDe } from './date'
import type { Absence, Crise, DailyEntry, SuiviEvent, Weight } from './types'

/** Jour local d'un horodatage, au format YYYY-MM-DD. */
export function jourDe(at: string): string {
  const d = new Date(at)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Délai entre un symptôme et le repas précédent le plus proche, ex.
 * « repas 1 h 20 avant ». Au-delà de 8 h, le rapprochement cesse d'être
 * informatif : on signale juste qu'aucun repas récent ne l'explique. */
export function delaiRepas(at: string, repas: SuiviEvent[]): string | null {
  const t = new Date(at).getTime()
  const anterieurs = repas.filter((r) => new Date(r.at).getTime() <= t)
  if (anterieurs.length === 0) return null
  const dernier = anterieurs.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b))
  const deltaMin = Math.round((t - new Date(dernier.at).getTime()) / 60_000)
  if (deltaMin > 8 * 60) return '> 8 h après le repas'
  const h = Math.floor(deltaMin / 60)
  const m = deltaMin % 60
  if (h === 0) return `repas ${m} min avant`
  if (m === 0) return `repas ${h} h avant`
  return `repas ${h} h ${m} min avant`
}

export type Categorie = SuiviEvent['type'] | 'poids'

export type LigneJour =
  | { id: string; kind: 'event'; categorie: SuiviEvent['type']; at: string; event: SuiviEvent }
  | { id: string; kind: 'poids'; categorie: 'poids'; at: string; poids: Weight }

/** Regroupe événements et pesées d'une journée en une liste unique triée du
 * plus récent au plus ancien. Une pesée n'a pas d'heure ; elle est ancrée à
 * midi, le point le plus neutre pour se mêler aux autres entrées du jour. */
export function lignesJour(events: SuiviEvent[], poids: Weight[]): LigneJour[] {
  const lignes: LigneJour[] = [
    ...events.map(
      (event): LigneJour => ({ id: event.id, kind: 'event', categorie: event.type, at: event.at, event }),
    ),
    ...poids.map(
      (p): LigneJour => ({ id: p.id, kind: 'poids', categorie: 'poids', at: `${p.date}T12:00:00`, poids: p }),
    ),
  ]
  return lignes.sort((a, b) => b.at.localeCompare(a.at))
}

/** Compte-rendu compact d'une ligne, pour l'affichage comme pour l'export. */
export function texteLigne(
  ligne: LigneJour,
  repas: SuiviEvent[],
): { emoji: string; titre: string; sousTitre: string | null; heure: string } {
  if (ligne.kind === 'poids') {
    return { emoji: EMOJI_POIDS, titre: `Pesée — ${ligne.poids.poids} kg`, sousTitre: null, heure: '—' }
  }
  const { event } = ligne
  const resume = resumeDetailsEvenement(event.type, event.details)
  const delai = event.type === 'symptome' ? delaiRepas(event.at, repas) : null
  const sousParts = [event.categorie, resume, delai].filter((v): v is string => Boolean(v))
  return {
    emoji: emojiEvenement(event.type, event.nom),
    titre: `${event.nom}${event.intensite !== null ? ` (${event.intensite})` : ''}`,
    sousTitre: sousParts.length > 0 ? sousParts.join(' · ') : null,
    heure: heureDe(event.at),
  }
}

/** Compte-rendu chiffré d'une journée : ce qui alimente les badges de résumé. */
export function resumeJour(
  events: SuiviEvent[],
  entry: DailyEntry | null,
  crises: Crise[],
): { reflux: number; selleScore: number | null; vomissements: number; crise: boolean } {
  const reflux = events.filter((e) => e.type === 'symptome' && e.nom === 'Reflux').length
  const sellesIntensites = events
    .filter((e) => e.type === 'selle' && e.intensite !== null)
    .map((e) => e.intensite!)
  const selleScore =
    sellesIntensites.length > 0 ? Math.max(...sellesIntensites) : (entry?.score_fecal ?? null)
  return {
    reflux,
    selleScore,
    vomissements: entry?.vomissements_count ?? 0,
    crise: crises.length > 0,
  }
}

export type Gravite = 'rouge' | 'orange' | 'verte' | 'neutre'

/** Code de couleur d'une journée : une crise ou des signes marqués priment
 * sur le reste, une journée sans aucune saisie reste neutre. */
export function graviteJour(events: SuiviEvent[], entry: DailyEntry | null, crises: Crise[]): Gravite {
  const { selleScore, vomissements, crise } = resumeJour(events, entry, crises)
  if (crise || (selleScore ?? 0) >= 6 || vomissements >= 2) return 'rouge'
  const symptomes = events.filter((e) => e.type === 'symptome').length
  if (symptomes > 0 || (selleScore ?? 0) >= 4 || vomissements >= 1) return 'orange'
  if (entry || events.length > 0) return 'verte'
  return 'neutre'
}

/** Une crise (ou une absence) dure de date_debut à date_fin (ou jusqu'à
 * aujourd'hui si encore en cours) : `borne` est la fin à considérer sans
 * date_fin, typiquement la fenêtre affichée (déjà plafonnée à aujourd'hui
 * partout). Exportée pour le même besoin que joursDeLEpisode côté dossier
 * partagé. */
export function estActiveLe(episode: { date_debut: string; date_fin: string | null }, date: string, borne: string): boolean {
  return date >= episode.date_debut && date <= (episode.date_fin ?? borne)
}

/** Tous les jours d'un épisode [date_debut, date_fin] compris dans la
 * fenêtre [debut, fin] — pour qu'une absence produise une carte chaque
 * jour, même sans autre saisie, plutôt que de disparaître silencieusement
 * du journal. Exportée : le dossier partagé au vétérinaire construit sa
 * propre liste de jours (sans passer par construireJours) mais a besoin de
 * la même expansion. */
export function joursDeLEpisode(
  episode: { date_debut: string; date_fin: string | null },
  debut: string,
  fin: string,
): string[] {
  const jours: string[] = []
  let curseur = episode.date_debut > debut ? episode.date_debut : debut
  const borneFin = episode.date_fin && episode.date_fin < fin ? episode.date_fin : fin
  while (curseur <= borneFin) {
    jours.push(curseur)
    const d = new Date(`${curseur}T00:00:00`)
    d.setDate(d.getDate() + 1)
    curseur = d.toISOString().slice(0, 10)
  }
  return jours
}

export type Jour = {
  date: string
  /** Crises qui ont démarré ce jour-là : c'est ce qui porte la bannière
   * détaillée, une seule fois par crise plutôt qu'à chaque jour de l'épisode. */
  crises: Crise[]
  /** Même logique que crises, pour la bannière d'absence. */
  absences: Absence[]
  /** true si ce jour tombe dans une absence en cours, même hors du jour de
   * début : c'est ce qui porte le badge, répété sur toute la durée. */
  absenceActive: boolean
  lignes: LigneJour[]
  resume: ReturnType<typeof resumeJour>
  gravite: Gravite
}

/** Regroupe entrées, crises, absences, événements et pesées par jour local,
 * sur une fenêtre [debut, fin] incluse. events peut déborder cette fenêtre
 * en amont (pour calculer le délai repas du premier jour) : seuls les jours
 * >= debut donnent lieu à une carte. Partagé entre le Journal et l'export
 * PDF, pour que les deux affichent exactement le même regroupement.
 *
 * Une crise est un épisode, pas un jour isolé : chaque jour de l'épisode
 * compte pour le badge et la gravité (resume/gravite reçoivent les crises
 * actives ce jour-là), mais la bannière détaillée n'apparaît que le jour de
 * début, pour ne pas la répéter à l'identique sur toute la durée. Une
 * absence suit le même principe, à la différence près qu'elle doit aussi
 * faire apparaître une carte les jours qui n'auraient sinon aucune saisie. */
export function construireJours(
  entries: DailyEntry[],
  crises: Crise[],
  absences: Absence[],
  events: SuiviEvent[],
  poids: Weight[],
  debut: string,
  fin: string,
): Jour[] {
  const dates = new Set<string>([
    ...entries.map((e) => e.date),
    ...crises.map((c) => c.date_debut),
    ...events.filter((e) => jourDe(e.at) >= debut).map((e) => jourDe(e.at)),
    ...poids.map((p) => p.date),
    ...absences.flatMap((a) => joursDeLEpisode(a, debut, fin)),
  ])
  return [...dates]
    .filter((date) => date >= debut && date <= fin)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const evenementsJour = events.filter((e) => jourDe(e.at) === date)
      const poidsJour = poids.filter((p) => p.date === date)
      const crisesActives = crises.filter((c) => estActiveLe(c, date, fin))
      const crisesDebut = crises.filter((c) => c.date_debut === date)
      const absencesActives = absences.filter((a) => estActiveLe(a, date, fin))
      const absencesDebut = absences.filter((a) => a.date_debut === date)
      const entryJour = entries.find((e) => e.date === date) ?? null
      return {
        date,
        crises: crisesDebut,
        absences: absencesDebut,
        absenceActive: absencesActives.length > 0,
        lignes: lignesJour(evenementsJour, poidsJour),
        resume: resumeJour(evenementsJour, entryJour, crisesActives),
        gravite: graviteJour(evenementsJour, entryJour, crisesActives),
      }
    })
}
