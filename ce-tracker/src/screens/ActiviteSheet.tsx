import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SuiviEvent } from '../lib/types'
import { datetimeLocalDe, horodatage, isoDeDatetimeLocal } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  date: string
  evenement?: SuiviEvent
  onClose: () => void
  onSaved: () => void
}

const SUGGESTIONS = ['Promenade', 'Sortie jardin', 'Trajet voiture']

/** Ce qui entoure le chien plutôt que ce qu'il présente : utile pour
 * relier plus tard une poussée de symptômes à un contexte. Sert aussi à
 * corriger une activité déjà enregistrée. */
export default function ActiviteSheet({ dogId, date, evenement, onClose, onSaved }: Props) {
  const maintenant = datetimeLocalDe(new Date().toISOString())
  const [nom, setNom] = useState(evenement?.nom ?? '')
  const [quand, setQuand] = useState(
    evenement ? datetimeLocalDe(evenement.at) : datetimeLocalDe(horodatage(date)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!nom.trim()) return
    setBusy(true)
    setError(null)
    const valeurs = {
      dog_id: dogId,
      at: isoDeDatetimeLocal(quand),
      type: 'activite' as const,
      nom: nom.trim(),
      categorie: null,
      intensite: null,
    }
    const { error: dbError } = evenement
      ? await supabase.from('events').update(valeurs).eq('id', evenement.id)
      : await supabase.from('events').insert(valeurs)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title="Activité" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={nom === s}
                onClick={() => setNom(s)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  nom === s ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Field label="Nom">
          <input value={nom} onChange={(e) => setNom(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Quand ?">
          <input
            type="datetime-local"
            value={quand}
            max={maintenant}
            onChange={(e) => setQuand(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button
          type="button"
          disabled={busy || !nom.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : evenement ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
