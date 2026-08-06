import { Suspense, lazy, useState } from 'react'
import type { Dog } from '../lib/types'
import { useVetMode } from '../lib/vetMode'
import { Spinner } from '../components/ui'
import AlimentationScreen from './AlimentationScreen'
import CarnetSanteScreen from './CarnetSanteScreen'
import DogFormScreen from './DogFormScreen'
import MedicationsScreen from './MedicationsScreen'
import NotificationsScreen from './NotificationsScreen'
import SharingScreen from './SharingScreen'
import VeterinairesScreen from './VeterinairesScreen'

type Vue =
  | 'fiche'
  | 'poids'
  | 'alimentation'
  | 'medicaments'
  | 'carnet_sante'
  | 'veterinaires'
  | 'partage'
  | 'notifications'

const VUES: { id: Vue; label: string; emoji: string }[] = [
  { id: 'fiche', label: 'Fiche', emoji: '🐶' },
  { id: 'poids', label: 'Poids', emoji: '⚖️' },
  { id: 'alimentation', label: 'Alimentation', emoji: '🍽️' },
  { id: 'medicaments', label: 'Médicaments', emoji: '💊' },
  { id: 'carnet_sante', label: 'Carnet de santé', emoji: '📖' },
  { id: 'veterinaires', label: 'Mes vétos', emoji: '🩺' },
  { id: 'partage', label: 'Partage', emoji: '🔗' },
  { id: 'notifications', label: 'Rappels', emoji: '🔔' },
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
  const isVet = useVetMode()
  const [vue, setVue] = useState<Vue>('fiche')
  // Partage (gestion des liens vétérinaire) et Rappels (abonnement aux
  // notifications de cet appareil) n'ont pas de sens pour le vétérinaire
  // lui-même : ni l'un ni l'autre n'est un contenu du dossier à consulter.
  const vuesVisibles = isVet ? VUES.filter((v) => v.id !== 'partage' && v.id !== 'notifications') : VUES

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 px-4 pt-4 pb-1">
        {vuesVisibles.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={vue === item.id}
            onClick={() => setVue(item.id)}
            className={`rounded-2xl px-2 py-4 text-center text-xs font-semibold transition-colors ${
              vue === item.id
                ? 'bg-brand-700 text-white ring-1 ring-brand-700'
                : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50'
            }`}
          >
            <span className="block text-xl leading-none">{item.emoji}</span>
            <span className="mt-1.5 block px-0.5 leading-tight break-words">{item.label}</span>
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
      {vue === 'carnet_sante' && <CarnetSanteScreen dogId={dog.id} />}
      {vue === 'veterinaires' && <VeterinairesScreen dogId={dog.id} />}
      {vue === 'partage' && !isVet && <SharingScreen dogId={dog.id} />}
      {vue === 'notifications' && !isVet && <NotificationsScreen dog={dog} />}
    </div>
  )
}
