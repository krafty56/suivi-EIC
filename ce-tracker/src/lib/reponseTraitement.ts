import { jourDe } from './journal'
import type { Crise, DailyEntry, DogMedication, SuiviEvent } from './types'

export type StatsFenetre = {
  scoreMoyen: number | null
  joursEnCrise: number
  vomissements: number
  reflux: number
  joursCouverts: number
}

export type ComparaisonTraitement = {
  medicationId: string
  nom: string
  dateDebut: string
  avant: StatsFenetre
  apres: StatsFenetre
}

const FENETRE_JOURS = 14

function ajouterJours(date: string, jours: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + jours)
  return d.toISOString().slice(0, 10)
}

/** Statistiques chiffrées d'une fenêtre [debut, fin] : score fécal moyen,
 * jours en crise, vomissements, reflux — les mêmes repères que les
 * graphiques d'Analyses, mais agrégés en quelques nombres plutôt qu'un
 * point par jour. Réutilisée par la comparaison avant/après traitement et
 * par la fiche de préparation au rendez-vous. */
export function statsFenetre(
  debut: string,
  fin: string,
  entries: DailyEntry[],
  events: SuiviEvent[],
  crises: Crise[],
): StatsFenetre {
  const entriesFenetre = entries.filter((e) => e.date >= debut && e.date <= fin)

  // Même logique que les graphiques : le pire score de selle du jour, événements
  // symptôme prioritaires sur le score saisi au bilan quotidien.
  const scoresParJour = new Map<string, number>()
  for (const e of events) {
    if (e.type === 'selle' && e.intensite !== null) {
      const j = jourDe(e.at)
      if (j >= debut && j <= fin) scoresParJour.set(j, Math.max(scoresParJour.get(j) ?? 0, e.intensite))
    }
  }
  for (const entry of entriesFenetre) {
    if (entry.score_fecal !== null && !scoresParJour.has(entry.date)) {
      scoresParJour.set(entry.date, entry.score_fecal)
    }
  }
  const scores = [...scoresParJour.values()]
  const scoreMoyen = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  let joursEnCrise = 0
  const curseur = new Date(`${debut}T00:00:00`)
  const arrivee = new Date(`${fin}T00:00:00`)
  while (curseur <= arrivee) {
    const iso = curseur.toISOString().slice(0, 10)
    if (crises.some((c) => iso >= c.date_debut && iso <= (c.date_fin ?? fin))) joursEnCrise++
    curseur.setDate(curseur.getDate() + 1)
  }

  const vomissements = entriesFenetre.reduce((s, e) => s + e.vomissements_count, 0)

  const reflux = events.filter(
    (e) => e.type === 'symptome' && e.nom === 'Reflux' && jourDe(e.at) >= debut && jourDe(e.at) <= fin,
  ).length

  return { scoreMoyen, joursEnCrise, vomissements, reflux, joursCouverts: entriesFenetre.length }
}

/** Compare l'état du chien avant/après le début de chaque traitement actif,
 * sur une fenêtre symétrique de 14 jours. dog_medications n'a pas de date
 * propre : le début est déduit du premier événement de type traitement lié
 * au médicament. Un traitement commencé depuis moins de 3 jours est écarté,
 * la fenêtre « après » serait trop courte pour être lisible. */
export function comparerTraitements(
  medications: DogMedication[],
  traitementEvents: SuiviEvent[],
  entries: DailyEntry[],
  events: SuiviEvent[],
  crises: Crise[],
  aujourdhui: string,
): ComparaisonTraitement[] {
  const resultats: ComparaisonTraitement[] = []

  for (const med of medications) {
    const evenementsMed = traitementEvents.filter((e) => e.dog_medication_id === med.id)
    if (evenementsMed.length === 0) continue
    const dateDebut = evenementsMed.map((e) => jourDe(e.at)).sort()[0]

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

    resultats.push({ medicationId: med.id, nom: med.nom_medicament, dateDebut, avant, apres })
  }

  return resultats
}
