import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DogMedication } from '../lib/types'
import { horodatage } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  date: string
  medications: DogMedication[]
  onClose: () => void
  onSaved: () => void
}

/** Enregistre la prise d'un médicament à l'heure exacte, en plus de la
 * checklist du jour : c'est ce qui permettra un jour de compter les prises. */
export default function TraitementSheet({ dogId, date, medications, onClose, onSaved }: Props) {
  const [choisi, setChoisi] = useState<DogMedication | null>(
    medications.length === 1 ? medications[0] : null,
  )
  const [hhmm, setHhmm] = useState(new Date().toTimeString().slice(0, 5))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (medications.length === 0) {
    return (
      <Sheet title="Traitement" onClose={onClose}>
        <p className="text-sm text-slate-500">
          Aucun médicament actif. Configurez le traitement dans l’onglet Chien.
        </p>
      </Sheet>
    )
  }

  if (!choisi) {
    return (
      <Sheet title="Quel médicament ?" onClose={onClose}>
        <div className="space-y-1.5">
          {medications.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setChoisi(m)}
              className="w-full rounded-xl bg-slate-50 px-3 py-3 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              <span className="font-medium">{m.nom_medicament}</span>
              {m.dose && <span className="ml-2 text-xs text-slate-500">{m.dose}</span>}
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  async function enregistrer() {
    setBusy(true)
    setError(null)
    const { error: dbError } = await supabase.from('events').insert({
      dog_id: dogId,
      at: horodatage(date, hhmm),
      type: 'traitement',
      nom: choisi!.nom_medicament,
      categorie: null,
      intensite: null,
      dog_medication_id: choisi!.id,
    })
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={choisi.nom_medicament} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Heure de prise">
          <input
            type="time"
            value={hhmm}
            onChange={(e) => setHhmm(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : 'Enregistrer la prise'}
        </Button>
        {medications.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            className="w-full py-2.5 text-sm"
            onClick={() => setChoisi(null)}
          >
            Retour à la liste
          </Button>
        )}
      </div>
    </Sheet>
  )
}
