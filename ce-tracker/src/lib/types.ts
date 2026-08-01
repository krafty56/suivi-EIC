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
  storage_path: string
  note: string | null
}

/** Ce que renvoie la fonction get_shared_dossier au vétérinaire. */
export type SharedDossier = {
  dog: Omit<Dog, 'owner_id'>
  share: { expires_at: string; clinic_email: string | null }
  medications: DogMedication[]
  entries: DailyEntry[]
  crises: Crise[]
  lab_reports: LabReport[]
}

export type FoodEntry = {
  id: string
  dog_id: string
  date_debut: string
  marque: string | null
  reference: string | null
  quantite_jour: string | null
}
