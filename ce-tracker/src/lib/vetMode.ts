import { createContext, useContext } from 'react'

/** Vrai lorsque l'application est ouverte par un vétérinaire via un lien de
 * partage (connexion anonyme, accès limité à un seul chien). Consommé
 * partout où un écran affiche un bouton Ajouter/Modifier/Supprimer, pour le
 * masquer : la vraie barrière est côté RLS (le vétérinaire ne peut de toute
 * façon rien écrire), ceci n'est que l'habillage — ne jamais s'y fier seul
 * pour une décision de sécurité. */
export const VetModeContext = createContext(false)

export function useVetMode(): boolean {
  return useContext(VetModeContext)
}
