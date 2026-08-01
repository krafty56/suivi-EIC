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

/** Une observation qui ne rentre dans aucun symptôme du catalogue : le
 * contexte du jour, un changement remarqué, une question pour le vétérinaire.
 * Sert aussi à corriger une note déjà enregistrée. */
export default function NoteLibreSheet({ dogId, date, evenement, onClose, onSaved }: Props) {
  const maintenant = datetimeLocalDe(new Date().toISOString())
  const [texte, setTexte] = useState(evenement?.note ?? '')
  const [quand, setQuand] = useState(
    evenement ? datetimeLocalDe(evenement.at) : datetimeLocalDe(horodatage(date)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!texte.trim()) return
    setBusy(true)
    setError(null)
    const valeurs = {
      dog_id: dogId,
      at: isoDeDatetimeLocal(quand),
      type: 'note' as const,
      nom: 'Note libre',
      categorie: null,
      intensite: null,
      note: texte.trim(),
    }
    const { error: dbError } = evenement
      ? await supabase.from('events').update(valeurs).eq('id', evenement.id)
      : await supabase.from('events').insert(valeurs)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title="Note libre" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Note">
          <textarea
            autoFocus
            rows={4}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            className={inputClass}
            placeholder="Ce que vous avez observé, le contexte…"
          />
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
          disabled={busy || !texte.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : evenement ? 'Enregistrer les modifications' : 'Enregistrer la note'}
        </Button>
      </div>
    </Sheet>
  )
}
