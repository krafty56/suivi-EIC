import type { EventType } from '../lib/types'

/** Libellés génériques d'un type d'événement, utilisés quand il n'a pas de
 * catégorie propre (repas, traitement, note, activité). */
export const LABEL_TYPE_EVENEMENT: Record<EventType, string> = {
  symptome: 'Symptôme',
  selle: 'Selle',
  repas: 'Repas',
  activite: 'Activité',
  traitement: 'Traitement',
  note: 'Note',
}
