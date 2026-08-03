import { useState } from 'react'
import type { Dog } from '../lib/types'
import { usePremium } from '../lib/premium'
import { Sheet } from '../components/ui'
import { Verrou } from '../components/Verrou'
import HistoryScreen from './HistoryScreen'
import PhotosScreen from './PhotosScreen'
import ScoresScreen from './ScoresScreen'

type Vue = 'journal' | 'scores' | 'photos'

const VUES: { id: Vue; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'scores', label: 'Scores' },
  { id: 'photos', label: 'Photos' },
]

type Props = { dog: Dog; onExport: () => void }

/** Les deux lectures du passé : le journal au jour le jour, les scores périodiques. */
export default function HistoryHubScreen({ dog, onExport }: Props) {
  const [vue, setVue] = useState<Vue>('journal')
  const [verrouOuvert, setVerrouOuvert] = useState(false)
  const { isPremium } = usePremium()

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-4">
        <div className="grid flex-1 grid-cols-3 gap-2">
          {VUES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={vue === item.id}
              onClick={() => setVue(item.id)}
              className={`min-w-0 truncate rounded-xl py-2 text-sm font-semibold transition-colors ${
                vue === item.id
                  ? 'bg-brand-700 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isPremium ? onExport() : setVerrouOuvert(true))}
          className="shrink-0 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          {isPremium ? '📄 PDF' : '🔒 PDF'}
        </button>
      </div>

      {vue === 'journal' && <HistoryScreen dogId={dog.id} />}
      {vue === 'scores' && <ScoresScreen dogId={dog.id} />}
      {vue === 'photos' && <PhotosScreen dogId={dog.id} />}

      {verrouOuvert && (
        <Sheet title="PDF vétérinaire" onClose={() => setVerrouOuvert(false)}>
          <Verrou
            titre="Export PDF"
            description="Génère un journal imprimable à remettre à votre vétérinaire."
          />
        </Sheet>
      )}
    </div>
  )
}
