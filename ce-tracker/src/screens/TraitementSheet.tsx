import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DogMedication, SuiviEvent } from '../lib/types'
import { datetimeLocalDe, horodatage, isoDeDatetimeLocal } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  date: string
  medications: DogMedication[]
  evenement?: SuiviEvent
  onClose: () => void
  onSaved: () => void
}

/** Enregistre la prise d'un médicament à l'heure exacte, en plus de la
 * checklist du jour : c'est ce qui permettra un jour de compter les prises.
 * Sert aussi à corriger l'heure d'une prise déjà enregistrée. */
export default function TraitementSheet({
  dogId,
  date,
  medications,
  evenement,
  onClose,
  onSaved,
}: Props) {
  const medicamentActuel = evenement
    ? (medications.find((m) => m.id === evenement.dog_medication_id) ?? null)
    : null
  const maintenant = datetimeLocalDe(new Date().toISOString())

  const [choisi, setChoisi] = useState<DogMedication | null>(
    evenement ? medicamentActuel : medications.length === 1 ? medications[0] : null,
  )
  const [quand, setQuand] = useState(
    evenement ? datetimeLocalDe(evenement.at) : datetimeLocalDe(horodatage(date)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    setBusy(true)
    setError(null)
    const valeurs = {
      dog_id: dogId,
      at: isoDeDatetimeLocal(quand),
      type: 'traitement' as const,
      nom: choisi?.nom_medicament ?? evenement!.nom,
      categorie: null,
      intensite: null,
      dog_medication_id: choisi?.id ?? evenement!.dog_medication_id,
    }
    const { error: dbError } = evenement
      ? await supabase.from('events').update(valeurs).eq('id', evenement.id)
      : await supabase.from('events').insert(valeurs)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  // Le médicament d'origine n'est plus actif : impossible de le reproposer
  // dans la liste, et on évite de requalifier silencieusement une prise
  // passée en la rattachant à un autre médicament. Seule l'heure se corrige.
  if (evenement && !medicamentActuel) {
    return (
      <Sheet title={`💊 ${evenement.nom}`} onClose={onClose}>
        <div className="space-y-5">
          <Field label="Heure de prise">
            <input
              type="datetime-local"
              value={quand}
              max={maintenant}
              onChange={(e) => setQuand(e.target.value)}
              className={inputClass}
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
            {busy ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </Sheet>
    )
  }

  if (medications.length === 0 && !evenement) {
    return (
      <Sheet title="💊 Traitement" onClose={onClose}>
        <p className="text-sm text-slate-500">
          Aucun médicament actif. Configurez le traitement dans l’onglet Chien.
        </p>
      </Sheet>
    )
  }

  if (!choisi) {
    return (
      <Sheet title="💊 Quel médicament ?" onClose={onClose}>
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

  return (
    <Sheet title={`💊 ${choisi.nom_medicament}`} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Heure de prise">
          <input
            type="datetime-local"
            value={quand}
            max={maintenant}
            onChange={(e) => setQuand(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : evenement ? 'Enregistrer les modifications' : 'Enregistrer la prise'}
        </Button>
        {medications.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            className="w-full py-2.5 text-sm"
            onClick={() => setChoisi(null)}
          >
            Changer
          </Button>
        )}
      </div>
    </Sheet>
  )
}
