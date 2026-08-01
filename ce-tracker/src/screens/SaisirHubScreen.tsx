import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appetit, DailyEntry, Dog, DogMedication, Energie, SuiviEvent } from '../lib/types'
import { APPETIT_OPTIONS, ENERGIE_OPTIONS } from '../data/catalogs'
import { formatTime, todayISO } from '../lib/date'
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  SegmentedControl,
  Spinner,
  inputClass,
} from '../components/ui'
import ActiviteSheet from './ActiviteSheet'
import CrisisSheet from './CrisisSheet'
import JournalSection from './JournalSection'
import NoteLibreSheet from './NoteLibreSheet'
import PoidsSheet from './PoidsSheet'
import TraitementSheet from './TraitementSheet'

type Props = { dog: Dog; onDogChange: (dog: Dog) => void }

type SaisieAutre =
  | { kind: 'traitement'; evenement?: SuiviEvent }
  | { kind: 'note'; evenement?: SuiviEvent }
  | { kind: 'activite'; evenement?: SuiviEvent }
  | { kind: 'poids' }
  | null

const CARTES_AUTRES: { id: 'traitement' | 'activite' | 'note' | 'poids'; label: string }[] = [
  { id: 'traitement', label: 'Traitement' },
  { id: 'activite', label: 'Activité' },
  { id: 'note', label: 'Note libre' },
  { id: 'poids', label: 'Poids' },
]

export default function SaisirHubScreen({ dog, onDogChange }: Props) {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [medications, setMedications] = useState<DogMedication[]>([])

  // Ce qui reste ici relève du jugement de fin de journée. Tout ce qui
  // s'observe à un instant précis — symptômes, selles, repas, traitement,
  // activité, note — est passé par le journal ou les cartes ci-dessous, qui
  // seuls permettent de compter.
  const [appetit, setAppetit] = useState<Appetit | null>(null)
  const [energie, setEnergie] = useState<Energie | null>(null)
  const [notes, setNotes] = useState('')
  const [takenMeds, setTakenMeds] = useState<Set<string>>(new Set())

  const [crisisSheet, setCrisisSheet] = useState(false)
  const [saisieAutre, setSaisieAutre] = useState<SaisieAutre>(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSaved(false)

    const [medsResult, entryResult] = await Promise.all([
      supabase
        .from('dog_medications')
        .select('*')
        .eq('dog_id', dog.id)
        .eq('actif', true)
        .order('heure_prise', { ascending: true, nullsFirst: false }),
      supabase.from('daily_entries').select('*').eq('dog_id', dog.id).eq('date', date).maybeSingle(),
    ])

    if (medsResult.error || entryResult.error) {
      setError((medsResult.error ?? entryResult.error)!.message)
      setLoading(false)
      return
    }

    setMedications(medsResult.data as DogMedication[])

    const entry = entryResult.data as DailyEntry | null
    setAppetit(entry?.appetit ?? null)
    setEnergie(entry?.energie ?? null)
    setNotes(entry?.notes ?? '')

    if (entry) {
      const { data: logs, error: logsError } = await supabase
        .from('medication_logs')
        .select('dog_medication_id, pris')
        .eq('daily_entry_id', entry.id)

      if (logsError) setError(logsError.message)
      else
        setTakenMeds(
          new Set(
            (logs ?? []).filter((log) => log.pris).map((log) => log.dog_medication_id as string),
          ),
        )
    } else {
      setTakenMeds(new Set())
    }

    setLoading(false)
  }, [dog.id, date])

  useEffect(() => {
    void load()
  }, [load])

  /** Un événement traitement/note/activité cliqué dans le journal : on ouvre
   * la feuille qui sait le modifier, pré-remplie. */
  function ouvrirEditionAutre(evenement: SuiviEvent) {
    if (evenement.type === 'traitement') setSaisieAutre({ kind: 'traitement', evenement })
    else if (evenement.type === 'note') setSaisieAutre({ kind: 'note', evenement })
    else if (evenement.type === 'activite') setSaisieAutre({ kind: 'activite', evenement })
  }

  function toggleMedication(id: string) {
    setTakenMeds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    setBusy(true)

    const { data: entry, error: entryError } = await supabase
      .from('daily_entries')
      .upsert(
        { dog_id: dog.id, date, appetit, energie, notes: notes.trim() || null },
        { onConflict: 'dog_id,date' },
      )
      .select()
      .single()

    if (entryError || !entry) {
      setBusy(false)
      setError(entryError?.message ?? 'Enregistrement impossible.')
      return
    }

    if (medications.length > 0) {
      const { error: logsError } = await supabase.from('medication_logs').upsert(
        medications.map((medication) => ({
          daily_entry_id: entry.id as string,
          dog_medication_id: medication.id,
          pris: takenMeds.has(medication.id),
        })),
        { onConflict: 'daily_entry_id,dog_medication_id' },
      )

      if (logsError) {
        setBusy(false)
        setError(logsError.message)
        return
      }
    }

    setBusy(false)
    setSaved(true)
  }

  return (
    <div className="pb-4">
      <div className="space-y-5 p-4">
        <Card>
          <Field label="Journée de">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <p className="mt-2 text-sm text-slate-600">Suivi de {dog.name}.</p>
        </Card>

        <JournalSection
          dog={dog}
          date={date}
          onDogChange={onDogChange}
          refreshSignal={refreshSignal}
          onEditAutre={ouvrirEditionAutre}
        />

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Autres saisies
          </p>
          <div className="grid grid-cols-4 gap-2">
            {CARTES_AUTRES.map((carte) => (
              <button
                key={carte.id}
                type="button"
                onClick={() => setSaisieAutre({ kind: carte.id } as SaisieAutre)}
                className="rounded-2xl bg-white px-2 py-4 text-center text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-brand-50"
              >
                {carte.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <>
            <Card>
              <p className="mb-2 text-sm font-medium text-slate-700">Appétit</p>
              <SegmentedControl options={APPETIT_OPTIONS} value={appetit} onChange={setAppetit} />
              <p className="mt-4 mb-2 text-sm font-medium text-slate-700">Énergie</p>
              <SegmentedControl options={ENERGIE_OPTIONS} value={energie} onChange={setEnergie} />
            </Card>

            <Card>
              <p className="mb-3 text-sm font-medium text-slate-700">Médicaments du jour</p>
              {medications.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucun médicament actif. Configurez le traitement dans l’onglet Chien.
                </p>
              ) : (
                <div className="space-y-2">
                  {medications.map((medication) => {
                    const checked = takenMeds.has(medication.id)
                    return (
                      <label
                        key={medication.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-3 ring-1 transition-colors ${
                          checked ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMedication(medication.id)}
                          className="h-5 w-5 shrink-0 accent-brand-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">
                            {medication.nom_medicament}
                          </span>
                          {medication.dose && (
                            <span className="block text-xs text-slate-500">{medication.dose}</span>
                          )}
                        </span>
                        {medication.heure_prise && (
                          <span className="shrink-0 text-sm font-medium tabular-nums text-slate-500">
                            {formatTime(medication.heure_prise)}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card>
              <Field label="Notes">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                  placeholder="Optionnel"
                />
              </Field>
            </Card>

            <ErrorMessage>{error}</ErrorMessage>
            {saved && <p className="text-sm font-medium text-brand-700">Journée enregistrée.</p>}
          </>
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || loading}
          className="w-full"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer la journée'}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="w-full py-2.5 text-sm"
          onClick={() => setCrisisSheet(true)}
        >
          Signaler une crise
        </Button>
      </div>

      {crisisSheet && (
        <CrisisSheet
          dogId={dog.id}
          onClose={() => setCrisisSheet(false)}
          onSaved={() => setCrisisSheet(false)}
        />
      )}

      {saisieAutre?.kind === 'traitement' && (
        <TraitementSheet
          key={saisieAutre.evenement?.id ?? 'nouveau'}
          dogId={dog.id}
          date={date}
          medications={medications}
          evenement={saisieAutre.evenement}
          onClose={() => setSaisieAutre(null)}
          onSaved={() => {
            setSaisieAutre(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}

      {saisieAutre?.kind === 'note' && (
        <NoteLibreSheet
          key={saisieAutre.evenement?.id ?? 'nouveau'}
          dogId={dog.id}
          date={date}
          evenement={saisieAutre.evenement}
          onClose={() => setSaisieAutre(null)}
          onSaved={() => {
            setSaisieAutre(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}

      {saisieAutre?.kind === 'activite' && (
        <ActiviteSheet
          key={saisieAutre.evenement?.id ?? 'nouveau'}
          dogId={dog.id}
          date={date}
          evenement={saisieAutre.evenement}
          onClose={() => setSaisieAutre(null)}
          onSaved={() => {
            setSaisieAutre(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}

      {saisieAutre?.kind === 'poids' && (
        <PoidsSheet
          dog={dog}
          date={date}
          onClose={() => setSaisieAutre(null)}
          onSaved={(updated) => {
            setSaisieAutre(null)
            onDogChange(updated)
          }}
        />
      )}
    </div>
  )
}
