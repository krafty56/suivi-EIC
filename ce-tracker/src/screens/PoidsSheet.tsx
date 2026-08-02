import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Dog } from '../lib/types'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dog: Dog
  date: string
  onClose: () => void
  onSaved: (dog: Dog) => void
}

export default function PoidsSheet({ dog, date, onClose, onSaved }: Props) {
  const [poids, setPoids] = useState(dog.poids_actuel?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    const valeur = Number(poids.trim().replace(',', '.'))
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setError('Entrez un poids valide.')
      return
    }
    setBusy(true)
    setError(null)

    const { error: weightError } = await supabase
      .from('weights')
      .upsert({ dog_id: dog.id, date, poids: valeur }, { onConflict: 'dog_id,date' })

    if (weightError) {
      setBusy(false)
      setError(weightError.message)
      return
    }

    // Le poids affiché sur la fiche ne doit refléter que la mesure la plus
    // récente : une saisie a posteriori d'un jour passé ne doit pas l'écraser.
    if (date === todayISO()) {
      const { data, error: dogError } = await supabase
        .from('dogs')
        .update({ poids_actuel: valeur })
        .eq('id', dog.id)
        .select()
        .single()

      setBusy(false)
      if (dogError) {
        setError(dogError.message)
        return
      }
      onSaved(data as Dog)
      return
    }

    setBusy(false)
    onSaved(dog)
  }

  return (
    <Sheet title="⚖️ Poids" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Poids (kg)" hint={date !== todayISO() ? `Pour le ${date}` : undefined}>
          <input
            inputMode="decimal"
            autoFocus
            value={poids}
            onChange={(e) => setPoids(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : 'Enregistrer le poids'}
        </Button>
      </div>
    </Sheet>
  )
}
