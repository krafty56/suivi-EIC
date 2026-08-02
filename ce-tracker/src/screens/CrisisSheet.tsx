import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Changement } from '../lib/types'
import { CHANGEMENT_OPTIONS } from '../data/catalogs'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  onClose: () => void
  onSaved: () => void
}

export default function CrisisSheet({ dogId, onClose, onSaved }: Props) {
  const [date, setDate] = useState(todayISO())
  const [changements, setChangements] = useState<Changement[]>([])
  const [note, setNote] = useState('')
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

    const { error: dbError } = await supabase.from('crises').insert({
      dog_id: dogId,
      date,
      changements,
      note: note.trim() || null,
    })

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title="🚨 Signaler une crise" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Date de la crise">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

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
          {busy ? 'Enregistrement…' : 'Enregistrer la crise'}
        </Button>
      </form>
    </Sheet>
  )
}
