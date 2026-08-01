import { useState } from 'react'
import HistoryScreen from './HistoryScreen'
import ScoresScreen from './ScoresScreen'

type Vue = 'journal' | 'scores'

const VUES: { id: Vue; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'scores', label: 'Scores' },
]

/** Les deux lectures du passé : le journal au jour le jour, les scores périodiques. */
export default function HistoryHubScreen({ dogId }: { dogId: string }) {
  const [vue, setVue] = useState<Vue>('journal')

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

      {vue === 'journal' ? <HistoryScreen dogId={dogId} /> : <ScoresScreen dogId={dogId} />}
    </div>
  )
}
