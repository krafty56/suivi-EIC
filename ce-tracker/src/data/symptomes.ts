/**
 * Catalogue de symptômes, transcrit depuis les listes fournies.
 *
 * Deux natures de relevé, reprises telles quelles :
 *   - « binaire » : le symptôme est constaté, sans graduation
 *   - « échelle » : il est coté de 1 à 3
 *
 * Ce fichier ne dépend pas de la façon dont les symptômes sont stockés : il
 * vaut aussi bien pour une saisie quotidienne que pour un journal horodaté.
 */

export type SymptomeDef = {
  nom: string
  /** true = coté de 1 à 3 ; false = simplement constaté. */
  echelle: boolean
}

export const CATALOGUE_SYMPTOMES: { categorie: string; symptomes: SymptomeDef[] }[] = [
  {
    categorie: 'Digestif',
    symptomes: [
      { nom: 'Rot', echelle: false },
      { nom: 'Gaz', echelle: true },
      { nom: 'Hoquet', echelle: false },
      { nom: 'Régurgitation', echelle: false },
      { nom: 'Position de prière', echelle: false },
      { nom: 'Déglutitions', echelle: false },
      { nom: 'Reflux', echelle: false },
      { nom: 'Vomissement', echelle: true },
      { nom: 'Nausée (bâillements, léchage babines)', echelle: true },
      { nom: 'Diarrhée franche', echelle: false },
      { nom: 'Flatulences', echelle: true },
      { nom: 'Borborygmes audibles', echelle: true },
      { nom: 'Distension abdominale', echelle: false },
      { nom: 'Herbe mangée', echelle: false },
      { nom: 'Refus alimentaire', echelle: false },
      { nom: 'Prise d’eau inhabituelle', echelle: false },
    ],
  },
  {
    categorie: 'Dermato',
    symptomes: [
      { nom: 'Grattage', echelle: true },
      { nom: 'Léchage compulsif patte/flanc', echelle: true },
      { nom: 'Rougeur cutanée', echelle: false },
      { nom: 'Pelage terne', echelle: false },
      { nom: 'Chute de poils localisée', echelle: false },
    ],
  },
  {
    // Ajoutée après l'inventaire des données personnelles importées : sur 548
    // relevés historiques, 153 portent cette catégorie, absente des deux
    // listes d'origine.
    categorie: 'Comportement',
    symptomes: [
      { nom: 'Déclenchement bruit', echelle: false },
      { nom: 'Déclenchement humain', echelle: true },
      { nom: 'Déclenchement chien', echelle: false },
      { nom: 'Agitation / incapacité à se poser', echelle: true },
    ],
  },
]

/** Libellés des cotations de l'échelle 1-3. */
export const COTATIONS: { valeur: 1 | 2 | 3; label: string }[] = [
  { valeur: 1, label: 'Léger' },
  { valeur: 2, label: 'Modéré' },
  { valeur: 3, label: 'Marqué' },
]

export const TOUS_LES_SYMPTOMES = CATALOGUE_SYMPTOMES.flatMap((groupe) =>
  groupe.symptomes.map((symptome) => ({ ...symptome, categorie: groupe.categorie })),
)
