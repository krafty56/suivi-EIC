import { resumeDetailsEvenement } from '../data/catalogs'
import { emojiEvenement, EMOJI_POIDS } from '../data/emoji'
import { heureDe } from './date'
import type { Crise, DailyEntry, SuiviEvent, Weight } from './types'

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
