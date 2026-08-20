import { formatLongDate, todayISO } from './date'
import { jourDe } from './journal'
import { ajouterJours, statsFenetre, type StatsFenetre } from './reponseTraitement'
import type {
  Absence,
  Crise,
  DailyEntry,
  DogMedication,
  FoodEntry,
  RepereesPersonnels,
  SuiviEvent,
  Vomissements,
} from './types'

/** Un point de repère sur la règle : soit calculé à partir d'un vrai épisode
 * (crise, semaine calme), soit déclaré à la main faute d'historique suffisant. */
export type PointRepere = {
  indice: number
  label: string
  traitement: string | null
  alimentation: string | null
  declare: boolean
}

export type ReglePersonnelle = {
  pire: PointRepere
  meilleure: PointRepere
  /** 0 = au niveau du pire épisode, 100 = au niveau de la meilleure période. */
  position: number
  aujourdhui: { traitement: string | null; alimentation: string | null }
  /** Crises passées à marquer discrètement sur la règle, hors celle déjà
   * représentée par le point « pire ». */
  crises: { id: string; label: string; position: number }[]
  /** false si au moins un des deux points vient d'une déclaration manuelle
   * plutôt que d'un vrai épisode enregistré. */
  toutCalcule: boolean
}

const PROXY_VOMISSEMENTS: Record<Vomissements, number> = { jamais: 0, parfois: 0.3, souvent: 1.5 }

/** Un seul nombre continu résumant la sévérité d'une fenêtre : le score
 * fécal (échelle de Purina, 1 à 7) domine, les vomissements l'aggravent.
 * Ce n'est pas un indice clinique reconnu — juste de quoi ordonner les
 * épisodes d'un même chien entre eux pour les placer sur la règle. */
function indiceGravite(scoreFecal: number, vomissementsParJour: number): number {
  return scoreFecal + vomissementsParJour * 2
}

function indiceGraviteFenetre(stats: StatsFenetre): number | null {
  if (stats.joursCouverts === 0) return null
  return indiceGravite(stats.scoreMoyen ?? 1, stats.vomissements / stats.joursCouverts)
}

function semaineDebut(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const jourISO = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - jourISO)
  return d.toISOString().slice(0, 10)
}

function moisAnnee(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
}

/** Noms des médicaments avec au moins une prise enregistrée à quelques jours
 * de la date donnée — dog_medications ne garde pas d'historique de « ce qui
 * était actif à telle date passée », seuls les événements de prise en disent
 * quelque chose. */
function medicamentsAutourDe(
  date: string,
  medications: DogMedication[],
  traitementEvents: SuiviEvent[],
): string | null {
  const debut = ajouterJours(date, -5)
  const fin = ajouterJours(date, 5)
  const idsProches = new Set(
    traitementEvents
      .filter((e) => e.dog_medication_id && jourDe(e.at) >= debut && jourDe(e.at) <= fin)
      .map((e) => e.dog_medication_id as string),
  )
  const noms = [...new Set(medications.filter((m) => idsProches.has(m.id)).map((m) => m.nom_medicament))]
  return noms.length > 0 ? noms.join(' + ') : null
}

function medicamentsActifsMaintenant(medications: DogMedication[]): string | null {
  const noms = medications.filter((m) => m.actif).map((m) => m.nom_medicament)
  return noms.length > 0 ? noms.join(' + ') : null
}

/** Aliment en cours à une date donnée : le plus récent changement dont la
 * date de début ne la dépasse pas — même logique que la carte « Actuel »
 * d'AlimentationScreen. */
function alimentationLe(date: string, foodEntries: FoodEntry[]): string | null {
  const actif = [...foodEntries]
    .filter((f) => f.date_debut <= date)
    .sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0]
  if (!actif) return null
  return [actif.marque, actif.reference].filter(Boolean).join(' — ') || null
}

function position(indicePire: number, indiceMeilleur: number, indiceActuel: number): number {
  if (indicePire === indiceMeilleur) return 50
  const p = ((indicePire - indiceActuel) / (indicePire - indiceMeilleur)) * 100
  return Math.max(0, Math.min(100, p))
}

/** Construit la règle personnelle du chien. Renvoie null tant qu'aucun
 * repère (calculé ou déclaré) n'est disponible aux deux extrémités — c'est
 * ce qui déclenche l'invite à déclarer des repères de départ côté écran. */
export function construireReglePersonnelle(
  entries: DailyEntry[],
  events: SuiviEvent[],
  crises: Crise[],
  absences: Absence[],
  traitementEvents: SuiviEvent[],
  medications: DogMedication[],
  foodEntries: FoodEntry[],
  repereDeclare: RepereesPersonnels | null,
  aujourdhui: string = todayISO(),
): ReglePersonnelle | null {
  // Pire épisode calculé : parmi les crises réelles, celle à l'indice moyen
  // le plus élevé sur sa propre durée.
  let pireCalcule: { id: string; indice: number; date: string } | null = null
  for (const crise of crises) {
    const fin = crise.date_fin ?? aujourdhui
    const stats = statsFenetre(crise.date_debut, fin, entries, events, crises)
    const indice = indiceGraviteFenetre(stats)
    if (indice === null) continue
    if (!pireCalcule || indice > pireCalcule.indice) pireCalcule = { id: crise.id, indice, date: crise.date_debut }
  }

  // Meilleure période calculée : parmi les semaines qui ne chevauchent ni
  // crise ni absence et comptent au moins 4 jours saisis, celle à l'indice
  // moyen le plus bas.
  let meilleureCalculee: { indice: number; debut: string } | null = null
  const semaines = new Set(entries.map((e) => semaineDebut(e.date)))
  for (const debut of semaines) {
    const fin = ajouterJours(debut, 6)
    const chevaucheEpisode =
      crises.some((c) => c.date_debut <= fin && (c.date_fin ?? aujourdhui) >= debut) ||
      absences.some((a) => a.date_debut <= fin && (a.date_fin ?? aujourdhui) >= debut)
    if (chevaucheEpisode) continue
    const stats = statsFenetre(debut, fin, entries, events, crises)
    if (stats.joursCouverts < 4) continue
    const indice = indiceGraviteFenetre(stats)
    if (indice === null) continue
    if (!meilleureCalculee || indice < meilleureCalculee.indice) meilleureCalculee = { indice, debut }
  }

  const pire: PointRepere | null = pireCalcule
    ? {
        indice: pireCalcule.indice,
        label: formatLongDate(pireCalcule.date),
        traitement: medicamentsAutourDe(pireCalcule.date, medications, traitementEvents),
        alimentation: alimentationLe(pireCalcule.date, foodEntries),
        declare: false,
      }
    : repereDeclare
      ? {
          indice: indiceGravite(repereDeclare.pire_score_fecal, PROXY_VOMISSEMENTS[repereDeclare.pire_vomissements]),
          label: 'Avant l’app',
          traitement: repereDeclare.pire_traitement,
          alimentation: repereDeclare.pire_alimentation,
          declare: true,
        }
      : null

  const meilleure: PointRepere | null = meilleureCalculee
    ? {
        indice: meilleureCalculee.indice,
        label: moisAnnee(meilleureCalculee.debut),
        traitement: medicamentsAutourDe(meilleureCalculee.debut, medications, traitementEvents),
        alimentation: alimentationLe(meilleureCalculee.debut, foodEntries),
        declare: false,
      }
    : repereDeclare
      ? {
          indice: indiceGravite(
            repereDeclare.meilleur_score_fecal,
            PROXY_VOMISSEMENTS[repereDeclare.meilleur_vomissements],
          ),
          label: 'Avant l’app',
          traitement: repereDeclare.meilleur_traitement,
          alimentation: repereDeclare.meilleur_alimentation,
          declare: true,
        }
      : null

  if (!pire || !meilleure) return null

  // Le pire doit rester au moins aussi sévère que la meilleure ; si des
  // repères déclarés sont entrés à l'envers, on les échange plutôt que
  // d'afficher une règle inversée.
  let [pireFinal, meilleureFinal] = pire.indice >= meilleure.indice ? [pire, meilleure] : [meilleure, pire]

  const statsAujourdhui = statsFenetre(ajouterJours(aujourdhui, -6), aujourdhui, entries, events, crises)
  const indiceActuel = indiceGraviteFenetre(statsAujourdhui) ?? (pireFinal.indice + meilleureFinal.indice) / 2

  const crisesTicks = crises
    .filter((c) => c.id !== pireCalcule?.id)
    .map((c) => {
      const fin = c.date_fin ?? aujourdhui
      const indice = indiceGraviteFenetre(statsFenetre(c.date_debut, fin, entries, events, crises))
      if (indice === null) return null
      return {
        id: c.id,
        label: formatLongDate(c.date_debut),
        position: position(pireFinal.indice, meilleureFinal.indice, indice),
      }
    })
    .filter((t): t is { id: string; label: string; position: number } => t !== null)

  return {
    pire: pireFinal,
    meilleure: meilleureFinal,
    position: position(pireFinal.indice, meilleureFinal.indice, indiceActuel),
    aujourdhui: {
      traitement: medicamentsActifsMaintenant(medications),
      alimentation: alimentationLe(aujourdhui, foodEntries),
    },
    crises: crisesTicks,
    toutCalcule: !pireFinal.declare && !meilleureFinal.declare,
  }
}
