import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Changement, Crise } from '../lib/types'
import { CHANGEMENT_OPTIONS } from '../data/catalogs'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  /** Présente : on modifie cette crise (typiquement pour y ajouter une date
   * de fin une fois résolue). Absente : on en signale une nouvelle. */
  crise?: Crise
  onClose: () => void
  onSaved: () => void
}

export default function CrisisSheet({ dogId, crise, onClose, onSaved }: Props) {
  const [dateDebut, setDateDebut] = useState(crise?.date_debut ?? todayISO())
  const [dateFin, setDateFin] = useState(crise?.date_fin ?? '')
  const [changements, setChangements] = useState<Changement[]>(crise?.changements ?? [])
  const [note, setNote] = useState(crise?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggle(value: Changement) {
    setChangements((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const payload = {
      dog_id: dogId,
      date_debut: dateDebut,
      date_fin: dateFin || null,
      changements,
      note: note.trim() || null,
    }

    const { error: dbError } = crise
      ? await supabase.from('crises').update(payload).eq('id', crise.id)
      : await supabase.from('crises').insert(payload)

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={crise ? '🚨 Modifier la crise' : '🚨 Signaler une crise'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de début">
            <input
              type="date"
              value={dateDebut}
              max={todayISO()}
              onChange={(e) => setDateDebut(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Date de fin" hint="Une fois la crise résolue">
            <input
              type="date"
              value={dateFin}
              min={dateDebut}
              max={todayISO()}
              onChange={(e) => setDateFin(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Qu’est-ce qui a changé récemment ?
          </p>
          <div className="space-y-2">
            {CHANGEMENT_OPTIONS.map((option) => {
              const checked = changements.includes(option.value)
              return (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 ring-1 transition-colors ${
                    checked ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option.value)}
                    className="h-5 w-5 accent-brand-700"
                  />
                  <span className="text-slate-800">{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <Field label="Note">
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Ce que vous avez observé, le contexte…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Enregistrement…' : crise ? 'Mettre à jour la crise' : 'Enregistrer la crise'}
        </Button>
      </form>
    </Sheet>
  )
}
