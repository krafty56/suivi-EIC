import { useState } from 'react'
import type { Dog } from '../lib/types'
import DogFormScreen from './DogFormScreen'
import MedicationsScreen from './MedicationsScreen'
import NotificationsScreen from './NotificationsScreen'
import SharingScreen from './SharingScreen'

type Vue = 'fiche' | 'medicaments' | 'partage' | 'notifications'

const VUES: { id: Vue; label: string }[] = [
  { id: 'fiche', label: 'Fiche' },
  { id: 'medicaments', label: 'Médicaments' },
  { id: 'partage', label: 'Partage' },
  { id: 'notifications', label: 'Rappels' },
]

type Props = {
  dog: Dog
  ownerId: string
  onSaved: (dog: Dog) => void
}

/** Regroupe ce qui se configure une fois : la fiche, le traitement, les liens vétérinaires. */
export default function DogHubScreen({ dog, ownerId, onSaved }: Props) {
  const [vue, setVue] = useState<Vue>('fiche')

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 px-4 pt-4">
        {VUES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={vue === item.id}
            onClick={() => setVue(item.id)}
            className={`rounded-xl py-2 text-xs font-semibold transition-colors ${
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
      {vue === 'medicaments' && <MedicationsScreen dogId={dog.id} />}
      {vue === 'partage' && <SharingScreen dogId={dog.id} />}
      {vue === 'notifications' && <NotificationsScreen dog={dog} />}
    </div>
  )
}
