import type { LabValue } from './types'

export type ParameterGroup = {
  key: string
  label: string
  category: string | null
  unit: string | null
  /** true si plusieurs unités coexistent pour ce paramètre (méthodes de dosage
   * différentes) : le graphe ne doit pas comparer les points entre elles. */
  unitesHeterogenes: boolean
  mesures: LabValue[] // triées par date croissante
  derniere: LabValue
}

/** Regroupe les valeurs par paramètre. Le libellé et l'unité affichés sont
 * ceux de la mesure la plus récente. */
export function grouperParParametre(valeurs: LabValue[]): ParameterGroup[] {
  const parClé = new Map<string, LabValue[]>()
  for (const v of valeurs) {
    const liste = parClé.get(v.parameter_key) ?? []
    liste.push(v)
    parClé.set(v.parameter_key, liste)
  }

  return [...parClé.entries()].map(([key, mesures]) => {
    const triees = [...mesures].sort((a, b) => a.date.localeCompare(b.date))
    const derniere = triees[triees.length - 1]
    const unites = new Set(triees.map((m) => m.unit).filter((u): u is string => !!u))
    return {
      key,
      label: derniere.parameter_label,
      category: derniere.category,
      unit: derniere.unit,
      unitesHeterogenes: unites.size > 1,
      mesures: triees,
      derniere,
    }
  })
}

export type ImportBatch = {
  batch: string
  date: string
  lab_name: string | null
  nombre: number
}

/** Regroupe les valeurs par import, du plus récent au plus ancien : c'est
 * l'unité qu'on supprime d'un coup — une analyse, pas une ligne à la fois.
 * Les valeurs sans import_batch (saisies avant l'introduction de l'import
 * photo, s'il y en a) n'apparaissent pas ici : rien à supprimer en bloc. */
export function grouperParImport(valeurs: LabValue[]): ImportBatch[] {
  const parLot = new Map<string, LabValue[]>()
  for (const v of valeurs) {
    if (!v.import_batch) continue
    const liste = parLot.get(v.import_batch) ?? []
    liste.push(v)
    parLot.set(v.import_batch, liste)
  }
  return [...parLot.entries()]
    .map(([batch, lignes]) => ({
      batch,
      date: lignes[0].date,
      lab_name: lignes[0].lab_name,
      nombre: lignes.length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Sépare une saisie libre en valeur numérique ou texte : virgule ou point
 * acceptés, comme pour les autres champs numériques de l'app. */
export function parseValeur(saisie: string): { value: number | null; value_text: string | null } {
  const brut = saisie.trim()
  if (!brut) return { value: null, value_text: null }
  const nombre = Number(brut.replace(',', '.'))
  return Number.isFinite(nombre) && /^-?[\d,.\s]+$/.test(brut)
    ? { value: nombre, value_text: null }
    : { value: null, value_text: brut }
}

/** Position de la valeur par rapport à l'intervalle de référence. Ne dépend
 * jamais du jugement de l'IA d'extraction : recalculée ici, y compris après
 * une correction manuelle en relecture, pour rester fiable. */
export function calculerFlag(
  value: number | null,
  refLow: number | null,
  refHigh: number | null,
): LabValue['flag'] {
  if (value === null || refLow === null || refHigh === null) return null
  if (value < refLow) return 'low'
  if (value > refHigh) return 'high'
  return 'normal'
}

const LABEL_FLAG: Record<string, string> = {
  normal: 'dans l’intervalle',
  low: 'bas',
  high: 'haut',
  abnormal: 'anormal',
}

export function libelleFlag(flag: string | null): string | null {
  return flag ? (LABEL_FLAG[flag] ?? flag) : null
}

/**
 * Écart entre les deux dernières mesures numériques de même unité.
 *
 * Un paramètre à unités hétérogènes (deux méthodes de dosage sous la même
 * clé, ex. cPL en µg/L et lipase DGGR en UI/L) peut avoir deux mesures le
 * même jour, une par méthode : comparer la dernière à l'avant-dernière sans
 * égard à l'unité donnerait un delta sans signification, comparant deux
 * échelles différentes. On ne compare donc qu'à l'intérieur d'une même unité.
 */
export function calculerTendance(mesures: LabValue[]): { delta: number; pct: number } | null {
  const numeriques = mesures.filter((m) => m.value !== null)
  if (numeriques.length === 0) return null
  const uniteReference = numeriques[numeriques.length - 1].unit
  const memeUnite = numeriques.filter((m) => m.unit === uniteReference)
  if (memeUnite.length < 2) return null
  const [avantDerniere, derniere] = memeUnite.slice(-2)
  const delta = derniere.value! - avantDerniere.value!
  if (avantDerniere.value === 0) return { delta, pct: 0 }
  return { delta, pct: (delta / Math.abs(avantDerniere.value!)) * 100 }
}

function moisEntre(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
}

/** Résumé en une phrase : nombre de mesures, tendance globale, position de la
 * dernière valeur. Une approximation volontairement simple, pas un portage
 * fidèle d'un algorithme qu'on ne peut pas observer depuis des captures. */
export function resumerParametre(groupe: ParameterGroup): string {
  const { mesures, derniere, unitesHeterogenes } = groupe
  const span = mesures.length > 1 ? moisEntre(mesures[0].date, derniere.date) : 0
  const horsIntervalle = mesures.filter((m) => m.flag && m.flag !== 'normal').length

  // La tendance ne compare que des mesures de même unité, pour la même
  // raison que calculerTendance : mélanger deux méthodes de dosage donnerait
  // un pourcentage sans signification.
  const numeriquesMemeUnite = mesures.filter((m) => m.value !== null && m.unit === derniere.unit)

  let tendance = ''
  if (numeriquesMemeUnite.length >= 2) {
    const premiere = numeriquesMemeUnite[0].value!
    const derniereVal = numeriquesMemeUnite[numeriquesMemeUnite.length - 1].value!
    const pct = premiere !== 0 ? ((derniereVal - premiere) / Math.abs(premiere)) * 100 : 0
    if (Math.abs(pct) < 10) tendance = 'stable'
    else tendance = `${pct > 0 ? 'hausse' : 'baisse'} ${Math.abs(pct) >= 25 ? 'marquée' : 'modérée'}`
  }

  const position =
    derniere.flag === 'normal'
      ? 'dans l’intervalle'
      : derniere.flag === 'low'
        ? 'sous l’intervalle'
        : derniere.flag === 'high'
          ? 'au-dessus de l’intervalle'
          : 'à interpréter avec le laboratoire'

  const parts = [`${mesures.length} mesure${mesures.length > 1 ? 's' : ''}`]
  if (span > 0) parts.push(`sur ${span} mois`)
  const debut = parts.join(' ') + (tendance ? ` : ${tendance}.` : '.')
  const fin = ` Dernière valeur ${position}${horsIntervalle > 0 ? ` (${horsIntervalle} mesure${horsIntervalle > 1 ? 's' : ''} hors intervalle sur la période)` : ''}.`
  const avertissement = unitesHeterogenes
    ? ' Unités hétérogènes selon les méthodes de dosage : ne comparer que les mesures de même unité.'
    : ''
  return debut + fin + avertissement
}

/** Unités courantes des analyses de sang et d'urine vétérinaires — biochimie,
 * hématologie, électrolytes, endocrinologie. Une liste, pas une contrainte :
 * l'écran d'édition garde toujours une option « Autre » en texte libre pour
 * ce qu'elle ne couvre pas. */
export const UNITES_LABO: string[] = [
  'g/L',
  'mg/L',
  'µg/L',
  'ng/L',
  'pg/L',
  'g/dL',
  'mg/dL',
  'mmol/L',
  'µmol/L',
  'nmol/L',
  'pmol/L',
  'mEq/L',
  'mOsm/L',
  'U/L',
  'UI/L',
  'G/L',
  'T/L',
  '/µL',
  'fL',
  'pg',
  'mmHg',
  '%',
]

export const CATEGORIE_LABELS: Record<string, string> = {
  digestive: 'Digestif / pancréas',
  hematology: 'Hématologie',
  liver: 'Foie',
  proteins: 'Protéines',
  kidney: 'Rein',
  metabolic: 'Métabolique',
  electrolytes: 'Électrolytes',
  endocrine: 'Endocrine',
  inflammation: 'Inflammation',
  other: 'Autre',
}
