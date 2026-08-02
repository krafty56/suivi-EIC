import type { EventType } from '../lib/types'

/** Un emoji par symptôme du catalogue, pour repérer une entrée d'un coup
 * d'œil dans une liste plutôt qu'à la lecture du libellé. */
const EMOJI_SYMPTOME: Record<string, string> = {
  // Digestif
  Rot: '🫧',
  Gaz: '💨',
  Hoquet: '😦',
  Régurgitation: '🤢',
  'Position de prière': '🙏',
  Déglutitions: '😮‍💨',
  Reflux: '🔄',
  Vomissement: '🤮',
  'Nausée (bâillements, léchage babines)': '🥱',
  'Diarrhée franche': '💦',
  Flatulences: '💨',
  'Borborygmes audibles': '🔊',
  'Distension abdominale': '🎈',
  'Herbe mangée': '🌿',
  'Refus alimentaire': '🙅',
  'Prise d’eau inhabituelle': '💧',
  // Dermato
  Grattage: '🐾',
  'Léchage compulsif patte/flanc': '👅',
  'Rougeur cutanée': '🔴',
  'Pelage terne': '💫',
  'Chute de poils localisée': '🍂',
  // Comportement
  'Déclenchement bruit': '🔊',
  'Déclenchement humain': '🙋',
  'Déclenchement chien': '🐕',
  'Agitation / incapacité à se poser': '😰',
}

/** Quelques activités du catalogue de suggestions ont un emoji dédié ; les
 * autres (texte libre) retombent sur l'emoji générique du type. */
const EMOJI_ACTIVITE: Record<string, string> = {
  Promenade: '🚶',
  'Sortie jardin': '🌳',
  'Trajet voiture': '🚗',
}

/** Emoji par défaut d'un type d'événement, utilisé quand le nom précis n'a
 * pas d'entrée dédiée. */
const EMOJI_TYPE: Record<EventType, string> = {
  symptome: '🩺',
  selle: '💩',
  repas: '🍽️',
  activite: '🐾',
  traitement: '💊',
  note: '📝',
}

export function emojiEvenement(type: EventType, nom: string): string {
  if (type === 'symptome') return EMOJI_SYMPTOME[nom] ?? EMOJI_TYPE.symptome
  if (type === 'activite') return EMOJI_ACTIVITE[nom] ?? EMOJI_TYPE.activite
  return EMOJI_TYPE[type]
}

export const EMOJI_CRISE = '🚨'
export const EMOJI_POIDS = '⚖️'
