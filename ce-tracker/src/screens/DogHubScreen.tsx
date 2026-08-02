import { Suspense, lazy, useState } from 'react'
import type { Dog } from '../lib/types'
import { Spinner } from '../components/ui'
import AlimentationScreen from './AlimentationScreen'
import DogFormScreen from './DogFormScreen'
import MedicationsScreen from './MedicationsScreen'
import NotificationsScreen from './NotificationsScreen'
import SharingScreen from './SharingScreen'
import VeterinairesScreen from './VeterinairesScreen'

type Vue = 'fiche' | 'poids' | 'alimentation' | 'medicaments' | 'veterinaires' | 'partage' | 'notifications'

const VUES: { id: Vue; label: string }[] = [
  { id: 'fiche', label: 'Fiche' },
  { id: 'poids', label: 'Poids' },
  { id: 'alimentation', label: 'Alimentation' },
  { id: 'medicaments', label: 'Médicaments' },
  { id: 'veterinaires', label: 'Mes vétos' },
  { id: 'partage', label: 'Partage' },
  { id: 'notifications', label: 'Rappels' },
]

type Props = {
  dog: Dog
  ownerId: string
  onSaved: (dog: Dog) => void
}

// Recharts pèse à lui seul plus que tout le reste de l'application. On le
// charge seulement quand l'onglet Poids est ouvert, comme pour Analyses.
const PoidsScreen = lazy(() => import('./PoidsScreen'))

/** Regroupe ce qui se configure une fois : la fiche, le poids, le traitement,
 * les liens vétérinaires. */
export default function DogHubScreen({ dog, ownerId, onSaved }: Props) {
  const [vue, setVue] = useState<Vue>('fiche')

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-4 pb-1">
        {VUES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={vue === item.id}
            onClick={() => setVue(item.id)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              vue === item.id
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {vue === 'fiche' && (
        <DogFormScreen key={dog.id} dog={dog} ownerId={ownerId} onSaved={onSaved} />
      )}
      {vue === 'poids' && (
        <Suspense fallback={<Spinner label="Chargement du suivi de poids…" />}>
          <PoidsScreen dog={dog} onDogChange={onSaved} />
        </Suspense>
      )}
      {vue === 'alimentation' && <AlimentationScreen dogId={dog.id} />}
      {vue === 'medicaments' && <MedicationsScreen dogId={dog.id} />}
      {vue === 'veterinaires' && <VeterinairesScreen dogId={dog.id} />}
      {vue === 'partage' && <SharingScreen dogId={dog.id} />}
      {vue === 'notifications' && <NotificationsScreen dog={dog} />}
    </div>
  )
}
