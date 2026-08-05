import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence } from '../lib/types'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  /** Présente : on modifie cette absence (typiquement pour y ajouter une
   * date de fin au retour). Absente : on en signale une nouvelle. */
  absence?: Absence
  onClose: () => void
  onSaved: () => void
}

export default function AbsenceSheet({ dogId, absence, onClose, onSaved }: Props) {
  const [dateDebut, setDateDebut] = useState(absence?.date_debut ?? todayISO())
  const [dateFin, setDateFin] = useState(absence?.date_fin ?? '')
  const [heureDebut, setHeureDebut] = useState(absence?.heure_debut?.slice(0, 5) ?? '')
  const [heureFin, setHeureFin] = useState(absence?.heure_fin?.slice(0, 5) ?? '')
  const [note, setNote] = useState(absence?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const payload = {
      dog_id: dogId,
      date_debut: dateDebut,
      date_fin: dateFin || null,
      heure_debut: heureDebut || null,
      heure_fin: heureFin || null,
      note: note.trim() || null,
    }

    const { error: dbError } = absence
      ? await supabase.from('absences').update(payload).eq('id', absence.id)
      : await supabase.from('absences').insert(payload)

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={absence ? '🧳 Modifier l’absence' : '🧳 Signaler une absence'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Aucun symptôme ne peut être noté comme fiable pendant cette période : elle apparaîtra
          comme telle dans le journal, les graphiques et le dossier vétérinaire, plutôt que de
          ressembler à des jours sans symptôme.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Depuis le">
            <input
              type="date"
              value={dateDebut}
              max={todayISO()}
              onChange={(e) => setDateDebut(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Jusqu’au" hint="Une fois de retour">
            <input
              type="date"
              value={dateFin}
              min={dateDebut}
              onChange={(e) => setDateFin(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="À partir de" hint="Optionnel">
            <input
              type="time"
              value={heureDebut}
              onChange={(e) => setHeureDebut(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Jusqu’à" hint="Optionnel">
            <input
              type="time"
              value={heureFin}
              onChange={(e) => setHeureFin(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Laissez vide pour une absence toute la journée.
        </p>

        <Field label="Note">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optionnel : chez qui, contexte…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Enregistrement…' : absence ? 'Mettre à jour l’absence' : 'Enregistrer l’absence'}
        </Button>
      </form>
    </Sheet>
  )
}
