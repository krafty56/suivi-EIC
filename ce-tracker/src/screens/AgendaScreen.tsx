import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appointment } from '../lib/types'
import { formatLongDate, formatTime, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

const SUGGESTIONS_MOTIF = [
  'Consultation de contrôle',
  'Analyses de sang',
  'Échographie',
  'Vaccin',
]

export default function AgendaScreen({ dogId }: Props) {
  const [rendezVous, setRendezVous] = useState<Appointment[] | null>(null)
  const [ajout, setAjout] = useState<'nouveau' | Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: dbError } = await supabase
      .from('appointments')
      .select('*')
      .eq('dog_id', dogId)
      .order('date', { ascending: true })
      .order('heure', { ascending: true, nullsFirst: false })

    if (dbError) setError(dbError.message)
    else setRendezVous(data as Appointment[])
  }, [dogId])

  useEffect(() => {
    void load()
  }, [load])

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('appointments').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (rendezVous === null) return <Spinner />

  const aVenir = rendezVous.filter((r) => r.date >= todayISO())
  const passes = [...rendezVous.filter((r) => r.date < todayISO())].reverse()

  return (
    <div className="space-y-4 p-4">
      <Button type="button" className="w-full" onClick={() => setAjout('nouveau')}>
        Ajouter un rendez-vous
      </Button>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          À venir
        </p>
        {aVenir.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Aucun rendez-vous à venir.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {aVenir.map((r) => (
              <LigneRendezVous key={r.id} r={r} onEdit={() => setAjout(r)} onDelete={() => void supprimer(r.id)} />
            ))}
          </div>
        )}
      </div>

      {passes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Passés
          </p>
          <div className="space-y-2">
            {passes.map((r) => (
              <LigneRendezVous key={r.id} r={r} onEdit={() => setAjout(r)} onDelete={() => void supprimer(r.id)} />
            ))}
          </div>
        </div>
      )}

      {ajout && (
        <RendezVousSheet
          key={ajout === 'nouveau' ? 'nouveau' : ajout.id}
          dogId={dogId}
          rendezVous={ajout === 'nouveau' ? null : ajout}
          onClose={() => setAjout(null)}
          onSaved={() => {
            setAjout(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function LigneRendezVous({
  r,
  onEdit,
  onDelete,
}: {
  r: Appointment
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50"
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 capitalize">{formatLongDate(r.date)}</p>
            <p className="mt-0.5 text-sm text-slate-700">
              {r.motif}
              {r.heure && <span className="text-slate-500"> · {formatTime(r.heure)}</span>}
            </p>
            {r.clinique && <p className="mt-0.5 text-xs text-slate-500">{r.clinique}</p>}
            {r.note && <p className="mt-1 text-sm text-slate-600">{r.note}</p>}
          </div>
        </button>
        <button
          type="button"
          aria-label={`Supprimer le rendez-vous du ${formatLongDate(r.date)}`}
          onClick={onDelete}
          className="shrink-0 self-start rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
        >
          &times;
        </button>
      </div>
    </Card>
  )
}

function RendezVousSheet({
  dogId,
  rendezVous,
  onClose,
  onSaved,
}: {
  dogId: string
  rendezVous: Appointment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(rendezVous?.date ?? todayISO())
  const [heure, setHeure] = useState(rendezVous?.heure?.slice(0, 5) ?? '')
  const [motif, setMotif] = useState(rendezVous?.motif ?? '')
  const [clinique, setClinique] = useState(rendezVous?.clinique ?? '')
  const [note, setNote] = useState(rendezVous?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!motif.trim()) return
    setBusy(true)
    setError(null)
    const valeurs = {
      dog_id: dogId,
      date,
      heure: heure || null,
      motif: motif.trim(),
      clinique: clinique.trim() || null,
      note: note.trim() || null,
    }
    const { error: dbError } = rendezVous
      ? await supabase.from('appointments').update(valeurs).eq('id', rendezVous.id)
      : await supabase.from('appointments').insert(valeurs)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={rendezVous ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS_MOTIF.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={motif === s}
                onClick={() => setMotif(s)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  motif === s
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Field label="Motif">
          <input value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Heure (optionnel)">
            <input
              type="time"
              value={heure}
              onChange={(e) => setHeure(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Clinique / vétérinaire (optionnel)">
          <input
            value={clinique}
            onChange={(e) => setClinique(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Note (optionnel)">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Ce qu'il faut préparer, ce qui en est ressorti…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button
          type="button"
          disabled={busy || !motif.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : rendezVous ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
