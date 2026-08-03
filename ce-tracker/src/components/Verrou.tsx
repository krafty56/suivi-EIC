import { useAbrirPremium } from '../lib/premiumUpgrade'
import { Button, Card } from './ui'

/** Contenu affiché à la place d'une fonctionnalité premium, avec un accès
 * direct à l'écran d'abonnement (paiement web Stripe, pas d'achat in-app). */
export function Verrou({ titre, description }: { titre: string; description: string }) {
  const abrirPremium = useAbrirPremium()
  return (
    <Card className="text-center">
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-1 font-bold text-slate-900">{titre}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <Button type="button" className="mt-3 w-full py-2 text-sm" onClick={abrirPremium}>
        Passer premium
      </Button>
    </Card>
  )
}
