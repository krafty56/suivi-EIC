import { Suspense, lazy, useState } from 'react'
import { usePremium } from '../lib/premium'
import { Spinner } from '../components/ui'
import { Verrou } from '../components/Verrou'

type Vue = 'parametres' | 'comptes-rendus'

const VUES: { id: Vue; label: string }[] = [
  { id: 'parametres', label: 'Paramètres' },
  { id: 'comptes-rendus', label: 'Comptes rendus' },
]

// Recharts pèse lourd : chargé seulement quand on ouvre les paramètres,
// comme pour les analyses.
const LabValuesScreen = lazy(() => import('./LabValuesScreen'))
const LabReportsScreen = lazy(() => import('./LabReportsScreen'))

export default function LabHubScreen({ dogId }: { dogId: string }) {
  const [vue, setVue] = useState<Vue>('parametres')
  const { isPremium, loading } = usePremium()

  if (loading) return <Spinner />

  if (!isPremium) {
    return (
      <div className="p-4">
        <Verrou
          titre="Labo"
          description="Suivi des paramètres sanguins et des comptes rendus d'analyses, réservé au premium."
        />
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 px-4 pt-4">
        {VUES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={vue === item.id}
            onClick={() => setVue(item.id)}
            className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
              vue === item.id
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<Spinner />}>
        {vue === 'parametres' ? (
          <LabValuesScreen dogId={dogId} />
        ) : (
          <LabReportsScreen dogId={dogId} />
        )}
      </Suspense>
    </div>
  )
}
