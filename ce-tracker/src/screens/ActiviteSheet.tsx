import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { horodatage } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  date: string
  onClose: () => void
  onSaved: () => void
}

const SUGGESTIONS = ['Promenade', 'Sortie jardin', 'Trajet voiture']

/** Ce qui entoure le chien plutôt que ce qu'il présente : utile pour
 * relier plus tard une poussée de symptômes à un contexte. */
export default function ActiviteSheet({ dogId, date, onClose, onSaved }: Props) {
  const [nom, setNom] = useState('')
  const [hhmm, setHhmm] = useState(new Date().toTimeString().slice(0, 5))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!nom.trim()) return
    setBusy(true)
    setError(null)
    const { error: dbError } = await supabase.from('events').insert({
      dog_id: dogId,
      at: horodatage(date, hhmm),
      type: 'activite',
      nom: nom.trim(),
      categorie: null,
      intensite: null,
    })
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

        <Field label="Heure">
          <input
            type="time"
            value={hhmm}
            onChange={(e) => setHhmm(e.target.value)}
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
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
