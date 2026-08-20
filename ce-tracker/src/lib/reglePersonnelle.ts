import { formatLongDate, todayISO } from './date'
import { jourDe } from './journal'
import { ajouterJours } from './reponseTraitement'
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

/** Détail d'un jour observé, tel qu'il entre dans la moyenne de sévérité —
 * exposé pour le bouton « Voir le détail » du repère personnel, afin que ce
 * qui alimente le calcul reste vérifiable plutôt qu'une boîte noire. */
export type JourDetail = {
  date: string
  scoreFecal: number | null
  vomissements: number
  symptomes: { nom: string; intensite: number | null }[]
  gravite: number
}

/** Un point de repère sur la règle : soit calculé à partir d'un vrai épisode
 * (semaine la plus sévère ou la plus calme de l'historique), soit déclaré à
 * la main faute d'historique suffisant — auquel cas debut/fin/jours restent
 * vides, il n'y a pas de fenêtre réelle à détailler. */
export type PointRepere = {
  indice: number
  label: string
  traitement: string | null
  alimentation: string | null
  declare: boolean
  debut: string | null
  fin: string | null
  jours: JourDetail[]
}

export type ReglePersonnelle = {
  pire: PointRepere
  meilleure: PointRepere
  /** 0 = au niveau du pire épisode, 100 = au niveau de la meilleure période. */
  position: number
  aujourdhui: {
    traitement: string | null
    alimentation: string | null
    debut: string
    fin: string
    jours: JourDetail[]
  }
  /** false si au moins un des deux points vient d'une déclaration manuelle
   * plutôt que d'un vrai épisode enregistré. */
  toutCalcule: boolean
}

/** Poids d'un symptôme simplement constaté (sans cotation 1-3) dans la
 * moyenne du jour : une valeur neutre, au milieu de l'échelle léger/modéré/
 * marqué utilisée pour les symptômes cotés. */
const POIDS_SYMPTOME_BINAIRE = 2
/** Un vomissement compte toujours comme un signe marqué, quelle que soit sa
 * fréquence ce jour-là. */
const POIDS_VOMISSEMENT = 3
const GRAVITE_VOMISSEMENTS_DECLARES: Record<Vomissements, number> = { jamais: 0, parfois: 1.5, souvent: 3 }

/** Ramène le score fécal (échelle de Purina, 1 à 7) sur la même échelle 0-3
 * que les symptômes cotés : 2 (bien formée) sert de référence saine, 7
 * (liquide) vaut la sévérité maximale. Un score 1 (très dure) n'est pas
 * traité comme un problème digestif au même titre qu'une diarrhée. */
function normaliserScoreFecal(score: number): number {
  return Math.max(0, ((score - 2) / 5) * 3)
}

/** Sévérité moyenne d'une journée : une seule note qui agrège tout ce qui a
 * été saisi ce jour-là — score fécal, vomissements, et chaque symptôme du
 * journal (coté ou simplement constaté) — plutôt que de ne retenir que le
 * score fécal et les vomissements. N'est appelée que sur des jours déjà
 * retenus par joursObserves (au moins un vrai signal digestif) : le repli à
 * 0 ci-dessous est une garde défensive, pas un cas normal. */
function graviteJournaliere(entry: DailyEntry | undefined, evenementsJour: SuiviEvent[]): number {
  const echantillons: number[] = []

  const scoresSelle = evenementsJour
    .filter((e) => e.type === 'selle' && e.intensite !== null)
    .map((e) => e.intensite as number)
  const scoreFecal = scoresSelle.length > 0 ? Math.max(...scoresSelle) : (entry?.score_fecal ?? null)
  if (scoreFecal !== null) echantillons.push(normaliserScoreFecal(scoreFecal))

  for (let i = 0; i < (entry?.vomissements_count ?? 0); i++) echantillons.push(POIDS_VOMISSEMENT)

  for (const e of evenementsJour) {
    if (e.type === 'symptome') echantillons.push(e.intensite ?? POIDS_SYMPTOME_BINAIRE)
  }

  return echantillons.length > 0 ? echantillons.reduce((a, b) => a + b, 0) / echantillons.length : 0
}

/** Un jour compte comme observé pour la règle personnelle seulement s'il
 * porte un vrai signal digestif : un score fécal (bilan ou selle), au moins
 * un vomissement, ou un événement selle/symptôme du journal. Un bilan
 * quotidien enregistré sans score fécal ni vomissement (seuls appétit/
 * énergie/notes renseignés) ne prouve rien sur l'état digestif de ce
 * jour-là : le compter comme calme aurait faussé la moyenne d'une vraie
 * période calme avec des jours simplement pas renseignés. Un repas, une
 * activité ou une note seuls ne suffisent pas non plus. */
function joursObserves(debut: string, fin: string, entries: DailyEntry[], events: SuiviEvent[]): Set<string> {
  const jours = new Set<string>()
  for (const e of entries) {
    if (e.date < debut || e.date > fin) continue
    if (e.score_fecal !== null || e.vomissements_count > 0) jours.add(e.date)
  }
  for (const e of events) {
    if (e.type !== 'selle' && e.type !== 'symptome') continue
    const j = jourDe(e.at)
    if (j >= debut && j <= fin) jours.add(j)
  }
  return jours
}

/** Sévérité moyenne d'une fenêtre [debut, fin] : la moyenne des sévérités
 * journalières de chaque jour observé (voir graviteJournaliere et
 * joursObserves) — pas seulement des jours de crise déclarée. joursCouverts
 * sert de seuil de fiabilité du calcul. */
function graviteFenetre(
  debut: string,
  fin: string,
  entries: DailyEntry[],
  events: SuiviEvent[],
): { indice: number | null; joursCouverts: number } {
  const jours = joursObserves(debut, fin, entries, events)
  if (jours.size === 0) return { indice: null, joursCouverts: 0 }
  const entriesParDate = new Map(entries.map((e) => [e.date, e]))
  const valeurs = [...jours].map((date) =>
    graviteJournaliere(
      entriesParDate.get(date),
      events.filter((e) => jourDe(e.at) === date),
    ),
  )
  return { indice: valeurs.reduce((a, b) => a + b, 0) / valeurs.length, joursCouverts: jours.size }
}

/** Détail jour par jour d'une fenêtre — ce qui a concrètement été utilisé
 * pour calculer sa sévérité moyenne. */
function detailJours(debut: string, fin: string, entries: DailyEntry[], events: SuiviEvent[]): JourDetail[] {
  const jours = joursObserves(debut, fin, entries, events)
  const entriesParDate = new Map(entries.map((e) => [e.date, e]))
  return [...jours].sort().map((date) => {
    const entry = entriesParDate.get(date)
    const evenementsJour = events.filter((e) => jourDe(e.at) === date)
    const scoresSelle = evenementsJour
      .filter((e) => e.type === 'selle' && e.intensite !== null)
      .map((e) => e.intensite as number)
    const scoreFecal = scoresSelle.length > 0 ? Math.max(...scoresSelle) : (entry?.score_fecal ?? null)
    return {
      date,
      scoreFecal,
      vomissements: entry?.vomissements_count ?? 0,
      symptomes: evenementsJour
        .filter((e) => e.type === 'symptome')
        .map((e) => ({ nom: e.nom, intensite: e.intensite })),
      gravite: graviteJournaliere(entry, evenementsJour),
    }
  })
}

function semaineDebut(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const jourISO = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - jourISO)
  return d.toISOString().slice(0, 10)
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
  const noms = [...new Set(medications.filter((m) => m.actif).map((m) => m.nom_medicament))]
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
  // Seuls les traitements liés à la digestion apparaissent comme contexte de
  // la règle : un traitement de fond sans rapport avec l'entéropathie (ex.
  // anxiolytique) n'a rien à faire dans la lecture du repère personnel.
  const medicationsDigestives = medications.filter((m) => m.pertinent_digestif)

  // Pire épisode et meilleure période calculés de la même façon, à partir de
  // la sévérité moyenne réelle (tous les symptômes saisis, pas seulement les
  // crises déclarées) : parmi les semaines d'au moins 4 jours saisis, celle
  // à l'indice le plus haut / le plus bas. Une semaine qui chevauche une
  // absence est écartée des deux côtés (observation non fiable) ; une
  // semaine qui chevauche une crise déclarée n'est en plus jamais retenue
  // comme meilleure période.
  const candidats: { indice: number; debut: string; chevaucheCrise: boolean }[] = []
  // Une semaine peut n'exister que via des événements journal (selle,
  // symptôme) sans aucun bilan quotidien rempli : elle doit quand même
  // pouvoir devenir candidate, au même titre que joursObserves ci-dessus.
  const semaines = new Set([
    ...entries.map((e) => semaineDebut(e.date)),
    ...events
      .filter((e) => e.type === 'selle' || e.type === 'symptome')
      .map((e) => semaineDebut(jourDe(e.at))),
  ])
  for (const debut of semaines) {
    const fin = ajouterJours(debut, 6)
    const chevaucheAbsence = absences.some((a) => a.date_debut <= fin && (a.date_fin ?? aujourdhui) >= debut)
    if (chevaucheAbsence) continue

    const { indice, joursCouverts } = graviteFenetre(debut, fin, entries, events)
    if (indice === null || joursCouverts < 4) continue

    const chevaucheCrise = crises.some((c) => c.date_debut <= fin && (c.date_fin ?? aujourdhui) >= debut)
    candidats.push({ indice, debut, chevaucheCrise })
  }

  function extremum(
    liste: { indice: number; debut: string }[],
    sens: 'max' | 'min',
  ): { indice: number; debut: string } | null {
    return liste.reduce<{ indice: number; debut: string } | null>((acc, c) => {
      if (!acc) return c
      const meilleurCandidat = sens === 'max' ? c.indice > acc.indice : c.indice < acc.indice
      return meilleurCandidat ? c : acc
    }, null)
  }

  let pireCalculee = extremum(candidats, 'max')
  let meilleureCalculee = extremum(
    candidats.filter((c) => !c.chevaucheCrise),
    'min',
  )
  // Les deux bornes ne peuvent pas venir de la même semaine : ce serait
  // afficher une seule vraie donnée comme s'il s'agissait de deux extrêmes
  // distincts. S'il n'existe pas encore de deuxième semaine utilisable, on
  // laisse le pire tenir la seule donnée réelle et on rabat la meilleure sur
  // le repère déclaré (ou sur l'invite à en déclarer un).
  if (pireCalculee && meilleureCalculee && pireCalculee.debut === meilleureCalculee.debut) {
    meilleureCalculee = extremum(
      candidats.filter((c) => !c.chevaucheCrise && c.debut !== pireCalculee!.debut),
      'min',
    )
  }

  const pire: PointRepere | null = pireCalculee
    ? {
        indice: pireCalculee.indice,
        label: `Semaine du ${formatLongDate(pireCalculee.debut)}`,
        traitement: medicamentsAutourDe(pireCalculee.debut, medicationsDigestives, traitementEvents),
        alimentation: alimentationLe(pireCalculee.debut, foodEntries),
        declare: false,
        debut: pireCalculee.debut,
        fin: ajouterJours(pireCalculee.debut, 6),
        jours: detailJours(pireCalculee.debut, ajouterJours(pireCalculee.debut, 6), entries, events),
      }
    : repereDeclare
      ? {
          indice: (normaliserScoreFecal(repereDeclare.pire_score_fecal) +
            GRAVITE_VOMISSEMENTS_DECLARES[repereDeclare.pire_vomissements]) /
            2,
          label: 'Avant l’app',
          traitement: repereDeclare.pire_traitement,
          alimentation: repereDeclare.pire_alimentation,
          declare: true,
          debut: null,
          fin: null,
          jours: [],
        }
      : null

  const meilleure: PointRepere | null = meilleureCalculee
    ? {
        indice: meilleureCalculee.indice,
        label: `Semaine du ${formatLongDate(meilleureCalculee.debut)}`,
        traitement: medicamentsAutourDe(meilleureCalculee.debut, medicationsDigestives, traitementEvents),
        alimentation: alimentationLe(meilleureCalculee.debut, foodEntries),
        declare: false,
        debut: meilleureCalculee.debut,
        fin: ajouterJours(meilleureCalculee.debut, 6),
        jours: detailJours(meilleureCalculee.debut, ajouterJours(meilleureCalculee.debut, 6), entries, events),
      }
    : repereDeclare
      ? {
          indice: (normaliserScoreFecal(repereDeclare.meilleur_score_fecal) +
            GRAVITE_VOMISSEMENTS_DECLARES[repereDeclare.meilleur_vomissements]) /
            2,
          label: 'Avant l’app',
          traitement: repereDeclare.meilleur_traitement,
          alimentation: repereDeclare.meilleur_alimentation,
          declare: true,
          debut: null,
          fin: null,
          jours: [],
        }
      : null

  if (!pire || !meilleure) return null

  // Le pire doit rester au moins aussi sévère que la meilleure ; si des
  // repères déclarés sont entrés à l'envers, on les échange plutôt que
  // d'afficher une règle inversée.
  const [pireFinal, meilleureFinal] = pire.indice >= meilleure.indice ? [pire, meilleure] : [meilleure, pire]

  const debutAujourdhui = ajouterJours(aujourdhui, -6)
  const statsAujourdhui = graviteFenetre(debutAujourdhui, aujourdhui, entries, events)
  const indiceActuel = statsAujourdhui.indice ?? (pireFinal.indice + meilleureFinal.indice) / 2

  return {
    pire: pireFinal,
    meilleure: meilleureFinal,
    position: position(pireFinal.indice, meilleureFinal.indice, indiceActuel),
    aujourdhui: {
      traitement: medicamentsActifsMaintenant(medicationsDigestives),
      alimentation: alimentationLe(aujourdhui, foodEntries),
      debut: debutAujourdhui,
      fin: aujourdhui,
      jours: detailJours(debutAujourdhui, aujourdhui, entries, events),
    },
    toutCalcule: !pireFinal.declare && !meilleureFinal.declare,
  }
}
