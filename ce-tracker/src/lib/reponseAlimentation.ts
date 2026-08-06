import { ajouterJours, statsFenetre, type StatsFenetre } from './reponseTraitement'
import type { Crise, DailyEntry, FoodEntry, SuiviEvent } from './types'

export type ComparaisonAlimentation = {
  foodEntryId: string
  nom: string
  dateDebut: string
  avant: StatsFenetre
  apres: StatsFenetre
  /** true si un signal notable apparaît après ce changement — pas une
   * certitude de lien de cause à effet, juste de quoi remarquer un aliment
   * à surveiller sans avoir à recroiser les dates soi-même. */
  suspect: boolean
  raison: string | null
}

const FENETRE_JOURS = 14
// Sur une moyenne lissée par 14 jours, un écart de 1,5 point (échelle de
// Purina 1 à 7) est déjà un changement net de consistance — pas une
// fluctuation normale d'un jour à l'autre.
const SEUIL_SCORE_FECAL = 1.5
// Vomissements par jour : 0,3 correspond à environ un vomissement tous les
// trois jours en plus, une fréquence qui se remarquerait à l'usage mais que
// personne ne recompte vraiment sur deux fenêtres de deux semaines.
const SEUIL_VOMISSEMENTS_PAR_JOUR = 0.3

function evaluerSuspect(avant: StatsFenetre, apres: StatsFenetre): { suspect: boolean; raison: string | null } {
  const raisons: string[] = []

  if (avant.scoreMoyen !== null && apres.scoreMoyen !== null) {
    const ecart = apres.scoreMoyen - avant.scoreMoyen
    if (ecart >= SEUIL_SCORE_FECAL) {
      raisons.push(`score fécal moyen en hausse (${avant.scoreMoyen.toFixed(1)} → ${apres.scoreMoyen.toFixed(1)})`)
    }
  }

  if (apres.joursEnCrise > avant.joursEnCrise) {
    raisons.push('crise apparue après ce changement, absente des 14 jours précédents')
  }

  const vomissementsAvant = avant.joursCouverts > 0 ? avant.vomissements / avant.joursCouverts : 0
  const vomissementsApres = apres.joursCouverts > 0 ? apres.vomissements / apres.joursCouverts : 0
  if (vomissementsApres - vomissementsAvant >= SEUIL_VOMISSEMENTS_PAR_JOUR) {
    raisons.push('vomissements plus fréquents après ce changement')
  }

  return { suspect: raisons.length > 0, raison: raisons.length > 0 ? raisons.join(' · ') : null }
}

/** Compare l'état du chien avant/après chaque changement alimentaire, sur
 * une fenêtre symétrique de 14 jours — même principe que
 * comparerTraitements, pour repérer un aliment suspect sans que le
 * propriétaire ait à recroiser les dates lui-même. Un changement remontant
 * à moins de 3 jours est écarté, la fenêtre « après » serait trop courte
 * pour être lisible. */
export function comparerAlimentation(
  foodEntries: FoodEntry[],
  entries: DailyEntry[],
  events: SuiviEvent[],
  crises: Crise[],
  aujourdhui: string,
): ComparaisonAlimentation[] {
  const resultats: ComparaisonAlimentation[] = []

  for (const food of foodEntries) {
    const dateDebut = food.date_debut

    const joursDepuis = Math.floor(
      (new Date(`${aujourdhui}T00:00:00`).getTime() - new Date(`${dateDebut}T00:00:00`).getTime()) /
        86_400_000,
    )
    if (joursDepuis < 3) continue

    const avant = statsFenetre(
      ajouterJours(dateDebut, -FENETRE_JOURS),
      ajouterJours(dateDebut, -1),
      entries,
      events,
      crises,
    )
    const apres = statsFenetre(
      dateDebut,
      ajouterJours(dateDebut, Math.min(FENETRE_JOURS, joursDepuis) - 1),
      entries,
      events,
      crises,
    )
    if (avant.joursCouverts === 0 && apres.joursCouverts === 0) continue

    const { suspect, raison } = evaluerSuspect(avant, apres)
    const nom = [food.marque, food.reference].filter(Boolean).join(' — ') || 'Changement alimentaire'

    resultats.push({ foodEntryId: food.id, nom, dateDebut, avant, apres, suspect, raison })
  }

  return resultats
}
