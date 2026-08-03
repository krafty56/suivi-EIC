import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorMessage, Sheet } from '../components/ui'

type Plan = 'monthly' | 'annual' | 'lifetime'

const PLANS: { id: Plan; label: string; prix: string; detail?: string }[] = [
  { id: 'monthly', label: 'Mensuel', prix: '4,99 €', detail: 'par mois, résiliable à tout moment' },
  { id: 'annual', label: 'Annuel', prix: '39,99 €', detail: 'par an, soit 3,33 €/mois' },
  { id: 'lifetime', label: 'À vie', prix: '79,99 €', detail: 'un seul paiement, accès pour toujours' },
]

export default function PremiumScreen({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choisir(plan: Plan) {
    setBusy(plan)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
      body: { plan, origin: window.location.origin },
    })
    if (fnError || !data?.url) {
      setError(fnError?.message ?? "Impossible de démarrer le paiement pour l'instant.")
      setBusy(null)
      return
    }
    window.location.href = data.url
  }

  return (
    <Sheet title="Passer premium" onClose={onClose}>
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
              onClick={() => void choisir(plan.id)}
            >
              {busy === plan.id ? '...' : 'Choisir'}
            </Button>
          </Card>
        ))}
      </div>
    </Sheet>
  )
}
