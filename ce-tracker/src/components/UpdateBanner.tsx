import { useEffect, useState } from 'react'

// Sur une PWA installée, rien ne recharge la page toute seule : elle peut
// rester ouverte plusieurs jours en arrière-plan avec l'ancien code, sans
// aucun bouton « actualiser » de navigateur pour forcer les choses. On
// vérifie donc périodiquement si un nouveau build a été déployé (version.json
// est régénéré à chaque build, voir vite.config.ts) pour proposer un vrai
// redémarrage plutôt que de laisser une version périmée tourner sans le dire.
const INTERVALLE_VERIFICATION_MS = 10 * 60 * 1000

async function versionDeployee(): Promise<string | null> {
  try {
    const reponse = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!reponse.ok) return null
    const donnees = (await reponse.json()) as { version?: unknown }
    return typeof donnees.version === 'string' ? donnees.version : null
  } catch {
    return null
  }
}

export default function UpdateBanner() {
  const [disponible, setDisponible] = useState(false)

  useEffect(() => {
    let annule = false

    async function verifier() {
      const distante = await versionDeployee()
      if (!annule && distante && distante !== __APP_VERSION__) setDisponible(true)
    }

    void verifier()
    const intervalle = setInterval(() => void verifier(), INTERVALLE_VERIFICATION_MS)

    function surRetourAuPremierPlan() {
      if (document.visibilityState === 'visible') void verifier()
    }
    document.addEventListener('visibilitychange', surRetourAuPremierPlan)

    return () => {
      annule = true
      clearInterval(intervalle)
      document.removeEventListener('visibilitychange', surRetourAuPremierPlan)
    }
  }, [])

  if (!disponible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <span className="min-w-0 flex-1">Nouvelle version disponible.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
      >
        Redémarrer
      </button>
    </div>
  )
}
