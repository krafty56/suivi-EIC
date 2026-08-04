import { jourDe } from './journal'
import type { Crise, DailyEntry, SuiviEvent } from './types'

export type Alerte = {
  id: string
  titre: string
  description: string
}

function heuresDepuis(at: string, maintenant: Date): number {
  return (maintenant.getTime() - new Date(at).getTime()) / 3_600_000
}

/** Repère des signaux à surveiller dans les sept derniers jours déjà
 * saisis : jamais un diagnostic, une invitation à consulter plutôt qu'une
 * alerte médicale. Les seuils (répétition, dégradation) reprennent les
 * mêmes repères que la carte « Quand consulter » de l'Agenda, appliqués
 * automatiquement aux données au lieu de compter sur l'œil du propriétaire. */
export function detecterAlertes(
  events: SuiviEvent[],
  entries: DailyEntry[],
  derniereCrise: Crise | null,
  maintenant: Date = new Date(),
): Alerte[] {
  const alertes: Alerte[] = []

  // Vomissements répétés : le comptage journalier (Bilan du jour), pas les
  // événements symptôme — c'est la même source que resumeJour/graviteJour.
  const entriesParDate = new Map(entries.map((e) => [e.date, e]))
  const aujourdhui = jourDe(maintenant.toISOString())
  const hier = jourDe(new Date(maintenant.getTime() - 24 * 3_600_000).toISOString())
  const vomissements48h =
    (entriesParDate.get(aujourdhui)?.vomissements_count ?? 0) +
    (entriesParDate.get(hier)?.vomissements_count ?? 0)
  if (vomissements48h >= 3) {
    alertes.push({
      id: 'vomissements',
      titre: 'Vomissements répétés',
      description: `${vomissements48h} vomissements en 48 h. Un avis vétérinaire est conseillé si ça se poursuit.`,
    })
  }

  // Reflux fréquents : comptés via les événements symptôme, comme resumeJour.
  const reflux24h = events.filter(
    (e) => e.type === 'symptome' && e.nom === 'Reflux' && heuresDepuis(e.at, maintenant) <= 24,
  ).length
  if (reflux24h >= 9) {
    alertes.push({
      id: 'reflux',
      titre: 'Reflux fréquents',
      description: `${reflux24h} reflux en 24 h, nettement plus que d'habitude.`,
    })
  }

  // Score fécal en dégradation : le pire score de chaque jour (échelle de
  // Purina, plus haut = pire), moyenne des 3 derniers jours contre les 4
  // précédents — même logique que graviteJour, étalée sur la semaine.
  const scoresParJour = new Map<string, number>()
  for (const e of events) {
    if (e.type === 'selle' && e.intensite !== null) {
      const j = jourDe(e.at)
      scoresParJour.set(j, Math.max(scoresParJour.get(j) ?? 0, e.intensite))
    }
  }
  for (const entry of entries) {
    if (entry.score_fecal !== null && !scoresParJour.has(entry.date)) {
      scoresParJour.set(entry.date, entry.score_fecal)
    }
  }
  const joursTries = [...scoresParJour.keys()].sort()
  const recents = joursTries.slice(-3).map((j) => scoresParJour.get(j)!)
  const precedents = joursTries.slice(-7, -3).map((j) => scoresParJour.get(j)!)
  if (recents.length === 3 && precedents.length >= 2) {
    const moyenneRecente = recents.reduce((a, b) => a + b, 0) / recents.length
    const moyennePrecedente = precedents.reduce((a, b) => a + b, 0) / precedents.length
    if (moyenneRecente - moyennePrecedente >= 2) {
      alertes.push({
        id: 'score-fecal',
        titre: 'Selles qui se dégradent',
        description: `Score fécal moyen en hausse ces 3 derniers jours (${moyenneRecente.toFixed(1)}/7 contre ${moyennePrecedente.toFixed(1)}/7 avant).`,
      })
    }
  }

  // Crise prolongée : toujours en cours après 3 jours sans résolution.
  if (derniereCrise && derniereCrise.date_fin === null) {
    const jours = Math.floor(heuresDepuis(`${derniereCrise.date_debut}T00:00:00`, maintenant) / 24)
    if (jours >= 3) {
      alertes.push({
        id: 'crise-prolongee',
        titre: 'Crise prolongée',
        description: `En crise depuis ${jours} jours sans clôture signalée.`,
      })
    }
  }

  return alertes
}
