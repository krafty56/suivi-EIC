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
}

/** Un des deux raccourcis de l'écran d'accueil. */
export type Raccourci = {
  type: EventType
  nom: string
  categorie: string | null
  echelle: boolean
}

export type Dog = {
  id: string
  owner_id: string
  name: string
  race: string | null
  age: number | null
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
  date: string
  changements: Changement[]
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
  events: SuiviEvent[]
  lab_reports: LabReport[]
  lab_values: LabValue[]
  weights: Weight[]
  scores: ClinicalScore[]
}

export type FoodEntry = {
  id: string
  dog_id: string
  date_debut: string
  marque: string | null
  reference: string | null
  quantite_jour: string | null
}
