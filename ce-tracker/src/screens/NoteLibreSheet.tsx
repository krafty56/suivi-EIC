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

/** Une observation qui ne rentre dans aucun symptôme du catalogue : le
 * contexte du jour, un changement remarqué, une question pour le vétérinaire. */
export default function NoteLibreSheet({ dogId, date, onClose, onSaved }: Props) {
  const [texte, setTexte] = useState('')
  const [hhmm, setHhmm] = useState(new Date().toTimeString().slice(0, 5))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!texte.trim()) return
    setBusy(true)
    setError(null)
    const { error: dbError } = await supabase.from('events').insert({
      dog_id: dogId,
      at: horodatage(date, hhmm),
      type: 'note',
      nom: 'Note libre',
      categorie: null,
      intensite: null,
      note: texte.trim(),
    })
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
          disabled={busy || !texte.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : 'Enregistrer la note'}
        </Button>
      </div>
    </Sheet>
  )
}
