import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { PremiumStatus } from './types'

/** Statut premium de l'utilisateur connecté. Absence de ligne (aucun achat
 * encore synchronisé) équivaut à non-premium plutôt qu'à une erreur. */
export function usePremium(): { isPremium: boolean; loading: boolean } {
  const [status, setStatus] = useState<PremiumStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

  return { isPremium: status?.is_premium ?? false, loading }
}
