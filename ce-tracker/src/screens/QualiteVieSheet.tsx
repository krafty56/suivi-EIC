import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { QualiteVie } from '../lib/types'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  dogName: string
  /** Entrée déjà enregistrée pour cette semaine, si elle existe : on la
   * modifie plutôt que d'en créer une seconde pour la même semaine. */
  entree: QualiteVie | null
  onClose: () => void
  onSaved: () => void
}

export default function QualiteVieSheet({ dogId, dogName, entree, onClose, onSaved }: Props) {
  const [score, setScore] = useState(entree?.score ?? 5)
  const [note, setNote] = useState(entree?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    setBusy(true)
    setError(null)
    const payload = {
      dog_id: dogId,
      date: entree?.date ?? todayISO(),
      score,
      note: note.trim() || null,
    }
    const { error: dbError } = entree
      ? await supabase.from('qualite_vie').update(payload).eq('id', entree.id)
      : await supabase.from('qualite_vie').insert(payload)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={`🐾 Comment était ${dogName} cette semaine ?`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Qualité de vie</p>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{score}/10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-2 w-full accent-brand-700"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Difficile</span>
            <span>Excellente</span>
          </div>
        </div>

        <Field label="Note (optionnel)">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Ce qui explique ce ressenti…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : entree ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
