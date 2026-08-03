import { createContext, useContext, type ReactNode } from 'react'

const PremiumUpgradeContext = createContext<(() => void) | null>(null)

export function PremiumUpgradeProvider({
  children,
  ouvrir,
}: {
  children: ReactNode
  ouvrir: () => void
}) {
  return <PremiumUpgradeContext.Provider value={ouvrir}>{children}</PremiumUpgradeContext.Provider>
}

/** Ouvre l'écran d'abonnement premium depuis n'importe quel Verrou, sans
 * faire remonter un callback à travers chaque écran appelant. */
export function useAbrirPremium(): () => void {
  const ouvrir = useContext(PremiumUpgradeContext)
  if (!ouvrir) throw new Error('useAbrirPremium doit être utilisé sous PremiumUpgradeProvider')
  return ouvrir
}
