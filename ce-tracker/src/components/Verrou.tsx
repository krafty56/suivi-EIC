import { Card } from './ui'

/** Contenu affiché à la place d'une fonctionnalité premium. Sans bouton
 * d'achat pour l'instant : le parcours RevenueCat n'est pas encore branché
 * côté app (nécessite Capacitor), donc rien à proposer de fonctionnel ici. */
export function Verrou({ titre, description }: { titre: string; description: string }) {
  return (
    <Card className="text-center">
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-1 font-bold text-slate-900">{titre}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-xs font-semibold text-brand-700">Fonctionnalité Premium</p>
    </Card>
  )
}
