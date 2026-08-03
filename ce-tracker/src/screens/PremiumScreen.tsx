import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePremium } from '../lib/premium'
import { Button, Card, ErrorMessage, Sheet, Spinner } from '../components/ui'

type Plan = 'monthly' | 'annual' | 'lifetime'

const PLANS: { id: Plan; label: string; prix: string; detail?: string }[] = [
  { id: 'monthly', label: 'Mensuel', prix: '4,99 €', detail: 'par mois, résiliable à tout moment' },
  { id: 'annual', label: 'Annuel', prix: '39,99 €', detail: 'par an, soit 3,33 €/mois' },
  { id: 'lifetime', label: 'À vie', prix: '79,99 €', detail: 'un seul paiement, accès pour toujours' },
]

export default function PremiumScreen({ onClose }: { onClose: () => void }) {
  const { isPremium, productId, loading } = usePremium()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function appeler(fonction: 'create-checkout-session' | 'create-portal-session', plan?: Plan) {
    setBusy(plan ?? fonction)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke(fonction, {
      body: { plan, origin: window.location.origin },
    })
    if (fnError || !data?.url) {
      setError(fnError?.message ?? "Impossible de continuer pour l'instant.")
      setBusy(null)
      return
    }
    window.location.href = data.url
  }

  const estAVie = productId === 'lifetime'

  return (
    <Sheet title={isPremium ? 'Mon abonnement' : 'Passer premium'} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : isPremium ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Export PDF, journal et analyses sans limite de période, galerie photo complète et
            partage vétérinaire illimité : tout est débloqué.
          </p>

          <ErrorMessage>{error}</ErrorMessage>

          {estAVie ? (
            <Card>
              <p className="text-sm font-semibold text-brand-800">
                Accès à vie — rien à gérer, merci pour ton soutien !
              </p>
            </Card>
          ) : (
            <>
              <Button
                type="button"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void appeler('create-portal-session')}
              >
                {busy === 'create-portal-session' ? '...' : 'Gérer mon abonnement'}
              </Button>
              <p className="text-xs text-slate-500">
                Changer de formule, mettre à jour le moyen de paiement, ou résilier.
              </p>

              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    À vie <span className="font-semibold text-brand-700">79,99 €</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Un seul paiement, plus jamais de renouvellement.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 py-2 text-sm"
                  disabled={busy !== null}
                  onClick={() => void appeler('create-checkout-session', 'lifetime')}
                >
                  {busy === 'lifetime' ? '...' : 'Choisir'}
                </Button>
              </Card>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Débloque l'export PDF vétérinaire, le journal et les analyses sans limite de période,
            la galerie photo complète et plusieurs liens de partage vétérinaire simultanés.
          </p>

          <ErrorMessage>{error}</ErrorMessage>

          {PLANS.map((plan) => (
            <Card key={plan.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">
                  {plan.label} <span className="font-semibold text-brand-700">{plan.prix}</span>
                </p>
                {plan.detail && <p className="text-xs text-slate-500">{plan.detail}</p>}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 py-2 text-sm"
                disabled={busy !== null}
                onClick={() => void appeler('create-checkout-session', plan.id)}
              >
                {busy === plan.id ? '...' : 'Choisir'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Sheet>
  )
}
