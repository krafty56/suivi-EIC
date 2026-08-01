/**
 * Grille de cotation CCECAI, transcrite telle qu'elle a été fournie.
 *
 * Les six premiers items constituent le CIBDAI (Jergens et al., J Vet Intern Med
 * 2003, doi:10.1111/j.1939-1676.2003.tb02450.x), total sur 18. Les trois
 * suivants — albuminémie, ascite/œdème, prurit — le complètent pour former le
 * CCECAI (Allenspach et al., J Vet Intern Med 2007), total sur 27.
 *
 * Aucun libellé n'est reformulé : ce fichier est la seule source de vérité du
 * barème, et c'est ici qu'il faut le corriger si la grille évolue.
 */

export type ScoreItemId =
  | 'attitude'
  | 'appetit'
  | 'vomissements'
  | 'selles_consistance'
  | 'selles_frequence'
  | 'perte_poids'
  | 'albumine'
  | 'ascite'
  | 'prurit'

export type ScoreItem = {
  id: ScoreItemId
  critere: string
  /** Libellés des cotations 0, 1, 2 et 3, dans cet ordre. */
  paliers: [string, string, string, string]
}

/** Les six critères cliniques communs au CIBDAI et au CCECAI. */
export const ITEMS_CIBDAI: ScoreItem[] = [
  {
    id: 'attitude',
    critere: 'Attitude / activité',
    paliers: ['Normale', 'Légèrement diminuée', 'Modérément diminuée', 'Sévèrement diminuée'],
  },
  {
    id: 'appetit',
    critere: 'Appétit',
    paliers: ['Normal', 'Légèrement diminué', 'Modérément diminué', 'Sévèrement diminué'],
  },
  {
    id: 'vomissements',
    critere: 'Vomissements',
    paliers: [
      'Aucun',
      'Légers (1× par semaine)',
      'Modérés (2-3 fois par semaine)',
      'Sévères (> 3/sem)',
    ],
  },
  {
    id: 'selles_consistance',
    critere: 'Consistance des selles',
    paliers: [
      'Normales',
      'Légèrement molles ou présence discrète de sang, mucus ou les deux',
      'Très molles',
      'Très molles',
    ],
  },
  {
    id: 'selles_frequence',
    critere: 'Fréquence de défécation',
    paliers: [
      'Normale',
      'Légèrement augmentée (2-3×/j)',
      'Modérément augmentée (4-5×/j)',
      'Sévèrement augmentée (> 5×/j)',
    ],
  },
  {
    id: 'perte_poids',
    critere: 'Perte de poids',
    paliers: ['Absence', 'Légère (< 5 %)', 'Modérée (5-10 %)', 'Sévère (> 10 %)'],
  },
]

/** Les trois critères que le CCECAI ajoute au CIBDAI. */
export const ITEMS_CCECAI_SUPPLEMENTAIRES: ScoreItem[] = [
  {
    id: 'albumine',
    critere: 'Albuminémie',
    paliers: ['> 20 g/L', '15 - 19,9 g/L', '12 - 14,9 g/L', '< 12 g/L'],
  },
  {
    id: 'ascite',
    critere: 'Présence d’ascite et d’œdème périphérique',
    paliers: [
      'Absence',
      'Ascite ou œdème périphérique léger',
      'Ascite ou œdème périphérique modéré',
      'Ascite / épanchement pleural ou œdème périphérique sévère',
    ],
  },
  {
    id: 'prurit',
    critere: 'Prurit',
    paliers: [
      'Absence',
      'Épisodes de démangeaison occasionnels',
      'Épisodes réguliers mais arrêt pendant le sommeil',
      'Réveils réguliers à cause des démangeaisons',
    ],
  },
]

export const TOUS_LES_ITEMS = [...ITEMS_CIBDAI, ...ITEMS_CCECAI_SUPPLEMENTAIRES]

export type Reponses = Partial<Record<ScoreItemId, number>>

/** Caractérisation de l'entéropathie selon le total CCECAI (sur 27). */
export function severiteCCECAI(total: number): string {
  if (total <= 3) return 'Cliniquement non significatif'
  if (total <= 5) return 'CIE légère'
  if (total <= 8) return 'CIE modérée'
  if (total <= 11) return 'CIE sévère'
  return 'CIE très sévère'
}

/**
 * Caractérisation selon le total CIBDAI (sur 18). Seuils repris de la
 * littérature : ≤ 3 non significatif, 4-5 léger, 6-8 modéré, ≥ 9 sévère.
 */
export function severiteCIBDAI(total: number): string {
  if (total <= 3) return 'Cliniquement non significatif'
  if (total <= 5) return 'Activité légère'
  if (total <= 8) return 'Activité modérée'
  return 'Activité sévère'
}

const somme = (reponses: Reponses, items: ScoreItem[]) =>
  items.reduce((total, item) => total + (reponses[item.id] ?? 0), 0)

const complet = (reponses: Reponses, items: ScoreItem[]) =>
  items.every((item) => reponses[item.id] !== undefined)

export function calculerCIBDAI(reponses: Reponses) {
  return {
    complet: complet(reponses, ITEMS_CIBDAI),
    total: somme(reponses, ITEMS_CIBDAI),
    severite: severiteCIBDAI(somme(reponses, ITEMS_CIBDAI)),
  }
}

export function calculerCCECAI(reponses: Reponses) {
  return {
    complet: complet(reponses, TOUS_LES_ITEMS),
    total: somme(reponses, TOUS_LES_ITEMS),
    severite: severiteCCECAI(somme(reponses, TOUS_LES_ITEMS)),
  }
}
