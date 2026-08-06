import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { PremiumStatus } from './types'
import { useVetMode } from './vetMode'

/** Statut premium de l'utilisateur connecté. Absence de ligne (aucun achat
 * encore synchronisé) équivaut à non-premium plutôt qu'à une erreur.
 *
 * En mode vétérinaire, la notion de premium ne veut rien dire (aucun compte,
 * aucun achat) : on renvoie toujours premium pour qu'aucun mur ne bloque la
 * consultation du dossier, quelle que soit la formule du propriétaire. */
export function usePremium(): { isPremium: boolean; productId: string | null; loading: boolean } {
  const isVet = useVetMode()
  const [status, setStatus] = useState<PremiumStatus | null>(null)
  const [loading, setLoading] = useState(!isVet)

  useEffect(() => {
    if (isVet) return
    let ignore = false
    async function load() {
      const { data } = await supabase
        .from('premium_status')
        .select('is_premium, product_id, expires_at')
        .maybeSingle()
      if (!ignore) {
        setStatus(data as PremiumStatus | null)
        setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [isVet])

  if (isVet) return { isPremium: true, productId: null, loading: false }
  return { isPremium: status?.is_premium ?? false, productId: status?.product_id ?? null, loading }
}
