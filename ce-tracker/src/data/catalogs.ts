import type { Appetit, Changement, Energie, Gravite } from '../lib/types'

/** Catalogue de médicaments, fixe pour cette phase. */
export const MEDICATION_CATALOG: { categorie: string; medicaments: string[] }[] = [
  {
    categorie: 'Anti-inflammatoires / immunosuppresseurs',
    medicaments: [
      'Prednisolone',
      'Budésonide',
      'Dexaméthasone',
      'Chlorambucil',
      'Ciclosporine',
      'Azathioprine',
      'Mycophénolate mofétil',
    ],
  },
  {
    categorie: 'Antibiotiques',
    medicaments: ['Métronidazole', 'Tylosine', 'Amoxicilline / amoxicilline-acide clavulanique'],
  },
  {
    categorie: 'Gastroprotecteurs',
    medicaments: ['Oméprazole', 'Famotidine', 'Sucralfate', 'Cimétidine'],
  },
  {
    categorie: 'Antiémétiques',
    medicaments: ['Maropitant', 'Métoclopramide', 'Ondansétron'],
  },
  {
    categorie: 'Probiotiques / régulateurs du transit',
    medicaments: [
      'Vivomixx',
      'Fortiflora',
      'Synbiotic DC',
      'Florequilibre',
      'Ultradiar Biotic',
      'Psyllium / fibres solubles',
    ],
  },
  {
    categorie: 'Supplémentation',
    medicaments: ['Cobalamine injectable', 'Folates'],
  },
  {
    categorie: 'Antispasmodiques',
    medicaments: ['Butylscopolamine', 'Fluoroglucinol'],
  },
  {
    categorie: 'Antidiarrhéiques',
    medicaments: ['Prifinial', 'Canidiarix'],
  },
]

/** Liste de symptômes du sélecteur « ajouter un symptôme », fixe pour cette phase. */
export const SYMPTOM_CATALOG: { categorie: string; symptomes: string[] }[] = [
  {
    categorie: 'Digestifs',
    symptomes: [
      'Fréquence des selles inhabituelle',
      'Sang dans les selles',
      'Glaires dans les selles',
      'Ténesme',
      'Douleur abdominale',
      'Ballonnements / distension',
      'Borborygmes',
      'Flatulences',
      'Régurgitations',
      'Hypersalivation / léchage des babines',
    ],
  },
  {
    categorie: 'Généraux',
    symptomes: ['Soif excessive', 'Urines abondantes'],
  },
  {
    categorie: 'Cutanés',
    symptomes: ['Démangeaisons', 'Perte de poils localisée'],
  },
]

/** Score fécal 1 à 7, avec la description courte affichée sous le score sélectionné. */
export const FECAL_SCORES: { score: number; description: string }[] = [
  { score: 1, description: 'Très dure et sèche, en petites boulettes, ne laisse aucune trace.' },
  { score: 2, description: 'Ferme, bien formée, segmentée, ne laisse pas de trace au ramassage.' },
  { score: 3, description: 'Bien formée mais plus humide, laisse une légère trace.' },
  { score: 4, description: 'Très humide, encore formée mais molle, laisse une trace nette.' },
  { score: 5, description: 'Très molle, perd sa forme, se dépose en tas.' },
  { score: 6, description: 'Texture de purée, sans forme définie.' },
  { score: 7, description: 'Liquide, aqueuse, aucune consistance.' },
]

export const APPETIT_OPTIONS: { value: Appetit; label: string }[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'normal', label: 'Normal' },
  { value: 'bon', label: 'Bon' },
]

export const ENERGIE_OPTIONS: { value: Energie; label: string }[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'normale', label: 'Normale' },
  { value: 'bonne', label: 'Bonne' },
]

export const GRAVITE_OPTIONS: { value: Gravite; label: string }[] = [
  { value: 'leger', label: 'Léger' },
  { value: 'modere', label: 'Modéré' },
  { value: 'marque', label: 'Marqué' },
]

export const CHANGEMENT_OPTIONS: { value: Changement; label: string }[] = [
  { value: 'alimentation', label: 'Alimentation' },
  { value: 'stress_evenement', label: 'Stress ou événement' },
  { value: 'medicament_modifie', label: 'Médicament modifié' },
  { value: 'autre', label: 'Autre' },
]

/** Grille BCS vétérinaire standard, 1 à 9. Les visuels seront ajoutés séparément. */
export const BCS_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Très maigre' },
  { value: 2, label: 'Maigre' },
  { value: 3, label: 'Mince' },
  { value: 4, label: 'Sous le poids idéal' },
  { value: 5, label: 'Idéal' },
  { value: 6, label: 'Au-dessus du poids idéal' },
  { value: 7, label: 'Surpoids' },
  { value: 8, label: 'Obèse' },
  { value: 9, label: 'Obésité sévère' },
]
