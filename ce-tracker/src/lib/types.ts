export type EventType = 'symptome' | 'selle' | 'repas' | 'activite' | 'traitement' | 'note'

/** Une observation horodatée : c'est ce qui rend les comptages possibles. */
export type SuiviEvent = {
  id: string
  dog_id: string
  at: string
  type: EventType
  nom: string
  categorie: string | null
  /** 1 à 3 pour un symptôme coté, 1 à 7 pour le score fécal d'une selle. */
  intensite: number | null
  /** Champs riches sans colonne dédiée : mucus, sang, volume, durée… */
  details: Record<string, unknown>
  note: string | null
  /** Renseigné pour un événement de type traitement : le médicament pris. */
  dog_medication_id: string | null
  /** Chemin dans le bucket stool-photos. Pour l'instant, seules les selles
   * peuvent en avoir un. */
  storage_path: string | null
}

export type LabValue = {
  id: string
  dog_id: string
  date: string
  lab_name: string | null
  parameter_key: string
  parameter_label: string
  category: string | null
  value: number | null
  value_text: string | null
  unit: string | null
  ref_low: number | null
  ref_high: number | null
  flag: 'low' | 'normal' | 'high' | 'abnormal' | null
  note: string | null
  /** Identifiant commun à toutes les valeurs d'une même analyse importée :
   * permet de supprimer l'import en un geste plutôt que ligne par ligne. */
  import_batch: string | null
}

/** Un des deux raccourcis de l'écran d'accueil. */
export type Raccourci = {
  type: EventType
  nom: string
  categorie: string | null
  echelle: boolean
  /** Renseigné pour une entrée personnalisée : son emoji ne vit dans aucune
   * table statique, il voyage donc avec le raccourci lui-même — y compris
   * une fois enregistré dans dogs.saisie_rapide. */
  emoji?: string
  /** true pour une entrée créée par le propriétaire (table custom_entries),
   * jamais pour le catalogue prédéfini : distingue les deux à l'affichage
   * (étoile) sans devoir recroiser les listes. */
  personnalise?: boolean
}

/** Entrée de suivi créée par le propriétaire lui-même, propre à son chien —
 * jamais partagée avec le reste de l'app, à l'inverse du catalogue de
 * symptômes prédéfini qui vit dans le code. */
export type CustomEntry = {
  id: string
  dog_id: string
  nom: string
  emoji: string
  echelle: boolean
}

export type Dog = {
  id: string
  owner_id: string
  name: string
  race: string | null
  date_naissance: string | null
  identification: string | null
  poids_actuel: number | null
  poids_ideal: number | null
  bcs: number | null
  date_diagnostic: string | null
  saisie_rapide: Raccourci[]
}

export type DogMedication = {
  id: string
  dog_id: string
  nom_medicament: string
  dose: string | null
  heure_prise: string | null
  actif: boolean
}

export type Appetit = 'faible' | 'normal' | 'bon'
export type Energie = 'faible' | 'normale' | 'bonne'
export type Gravite = 'leger' | 'modere' | 'marque'
/** Ce qui a été effectivement mangé au repas, distinct de l'appétit (l'envie
 * de manger) : un chien peut avoir un bon appétit et refuser malgré tout. */
export type QuantiteRepas = 'refus' | 'partiel' | 'entier'

export type Symptom = {
  nom: string
  gravite: Gravite
}

export type DailyEntry = {
  id: string
  dog_id: string
  date: string
  score_fecal: number | null
  appetit: Appetit | null
  energie: Energie | null
  vomissements_count: number
  selles_count: number | null
  symptoms: Symptom[]
  notes: string | null
}

export type MedicationLog = {
  id: string
  daily_entry_id: string
  dog_medication_id: string
  pris: boolean
}

export type Changement = 'alimentation' | 'stress_evenement' | 'medicament_modifie' | 'autre'

export type Crise = {
  id: string
  dog_id: string
  date_debut: string
  /** Renseignée une fois la crise résolue ; null tant qu'elle est en cours. */
  date_fin: string | null
  changements: Changement[]
  note: string | null
}

/** Période où le propriétaire était absent : aucun symptôme n'a pu être
 * observé pendant ce temps, à distinguer d'une période réellement calme
 * dans le journal, les graphiques et le dossier vétérinaire. Même forme que
 * Crise : date_fin nulle tant que l'absence est en cours. heure_debut et
 * heure_fin affinent le créneau dans les journées de bord — une absence
 * dépasse rarement 24h/24 — et restent nulles pour une absence à la
 * journée (week-end, voyage). */
export type Absence = {
  id: string
  dog_id: string
  date_debut: string
  date_fin: string | null
  heure_debut: string | null
  heure_fin: string | null
  note: string | null
}

export type VetShare = {
  id: string
  dog_id: string
  token: string
  clinic_email: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export type LabReport = {
  id: string
  dog_id: string
  date: string
  /** Absent pour un compte rendu texte seul, importé sans photo source. */
  storage_path: string | null
  lab_name: string | null
  note: string | null
  albumine: number | null
}

export type Weight = {
  id: string
  dog_id: string
  date: string
  poids: number
}

export type ClinicalScore = {
  id: string
  dog_id: string
  date: string
  indice: 'cibdai' | 'ccecai'
  items: Record<string, number>
  total: number
  severite: string | null
  note: string | null
}

export type Appointment = {
  id: string
  dog_id: string
  date: string
  heure: string | null
  motif: string
  clinique: string | null
  note: string | null
}

/** Ce que renvoie la fonction get_shared_dossier au vétérinaire. */
export type SharedDossier = {
  dog: Omit<Dog, 'owner_id'>
  share: { expires_at: string; clinic_email: string | null }
  medications: DogMedication[]
  entries: DailyEntry[]
  crises: Crise[]
  absences: Absence[]
  events: SuiviEvent[]
  lab_reports: LabReport[]
  lab_values: LabValue[]
  weights: Weight[]
  scores: ClinicalScore[]
  food_entries: FoodEntry[]
}

export type FoodEntry = {
  id: string
  dog_id: string
  date_debut: string
  marque: string | null
  reference: string | null
  quantite_jour: string | null
  note: string | null
}

export type Veterinaire = {
  id: string
  dog_id: string
  nom: string
  telephone: string | null
  email: string | null
}

/** Tenu à jour côté serveur par le webhook RevenueCat (voir premium_status). */
export type PremiumStatus = {
  is_premium: boolean
  product_id: string | null
  expires_at: string | null
}
