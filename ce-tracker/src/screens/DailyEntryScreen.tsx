import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appetit, DailyEntry, DogMedication, Energie, Gravite, Symptom } from '../lib/types'
import {
  APPETIT_OPTIONS,
  ENERGIE_OPTIONS,
  FECAL_SCORES,
  GRAVITE_OPTIONS,
  SYMPTOM_CATALOG,
} from '../data/catalogs'
import { formatTime, todayISO } from '../lib/date'
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  SegmentedControl,
  Sheet,
  Spinner,
  inputClass,
} from '../components/ui'
import CrisisSheet from './CrisisSheet'

type Props = { dogId: string; dogName: string }

export default function DailyEntryScreen({ dogId, dogName }: Props) {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [medications, setMedications] = useState<DogMedication[]>([])

  // État du formulaire : tout part à vide, une journée sans problème se valide en un geste.
  const [scoreFecal, setScoreFecal] = useState<number | null>(null)
  const [appetit, setAppetit] = useState<Appetit | null>(null)
  const [energie, setEnergie] = useState<Energie | null>(null)
  const [vomissements, setVomissements] = useState(0)
  // null = non renseigné, distinct de zéro : « aucune selle » est une observation.
  const [selles, setSelles] = useState<number | null>(null)
  const [symptoms, setSymptoms] = useState<Symptom[]>([])
  const [notes, setNotes] = useState('')
  const [takenMeds, setTakenMeds] = useState<Set<string>>(new Set())

  const [symptomSheet, setSymptomSheet] = useState(false)
  const [crisisSheet, setCrisisSheet] = useState(false)
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
        .eq('dog_id', dogId)
        .eq('actif', true)
        .order('heure_prise', { ascending: true, nullsFirst: false }),
      supabase.from('daily_entries').select('*').eq('dog_id', dogId).eq('date', date).maybeSingle(),
    ])

    if (medsResult.error || entryResult.error) {
      setError((medsResult.error ?? entryResult.error)!.message)
      setLoading(false)
      return
    }

    setMedications(medsResult.data as DogMedication[])

    const entry = entryResult.data as DailyEntry | null
    setScoreFecal(entry?.score_fecal ?? null)
    setAppetit(entry?.appetit ?? null)
    setEnergie(entry?.energie ?? null)
    setVomissements(entry?.vomissements_count ?? 0)
    setSelles(entry?.selles_count ?? null)
    setSymptoms(entry?.symptoms ?? [])
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
            (logs ?? [])
              .filter((log) => log.pris)
              .map((log) => log.dog_medication_id as string),
          ),
        )
    } else {
      setTakenMeds(new Set())
    }

    setLoading(false)
  }, [dogId, date])

  useEffect(() => {
    void load()
  }, [load])

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
        {
          dog_id: dogId,
          date,
          score_fecal: scoreFecal,
          appetit,
          energie,
          vomissements_count: vomissements,
          selles_count: selles,
          symptoms,
          notes: notes.trim() || null,
        },
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

  const selectedScore = FECAL_SCORES.find((item) => item.score === scoreFecal)

  return (
    <div className="pb-4">
      <div className="space-y-4 p-4">
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
          <p className="mt-2 text-sm text-slate-600">Suivi de {dogName}.</p>
        </Card>

        {loading ? (
          <Spinner />
        ) : (
          <>
            <Card>
              <p className="mb-3 text-sm font-medium text-slate-700">Score fécal</p>
              <div className="grid grid-cols-7 gap-1.5">
                {FECAL_SCORES.map((item) => (
                  <button
                    key={item.score}
                    type="button"
                    aria-pressed={scoreFecal === item.score}
                    aria-label={`Score fécal ${item.score}`}
                    onClick={() => setScoreFecal(scoreFecal === item.score ? null : item.score)}
                    className={`aspect-square rounded-full text-base font-bold transition-colors ${
                      scoreFecal === item.score
                        ? 'bg-brand-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {item.score}
                  </button>
                ))}
              </div>
              <p className="mt-3 min-h-10 text-sm text-slate-600">
                {selectedScore?.description ?? 'Aucun score sélectionné.'}
              </p>
            </Card>

            <Card>
              <p className="mb-2 text-sm font-medium text-slate-700">Appétit</p>
              <SegmentedControl options={APPETIT_OPTIONS} value={appetit} onChange={setAppetit} />
              <p className="mt-4 mb-2 text-sm font-medium text-slate-700">Énergie</p>
              <SegmentedControl options={ENERGIE_OPTIONS} value={energie} onChange={setEnergie} />
            </Card>

            <Card className="space-y-4">
              <Compteur
                libelle="Vomissements"
                nom="vomissement"
                valeur={vomissements}
                onChange={(v) => setVomissements(v ?? 0)}
              />
              <Compteur
                libelle="Selles"
                nom="selle"
                aide="Nombre de défécations sur la journée."
                valeur={selles}
                effacable
                onChange={setSelles}
              />
            </Card>

            <Card>
              <p className="mb-3 text-sm font-medium text-slate-700">Médicaments du jour</p>
              {medications.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucun médicament actif. Configurez le traitement dans l’onglet Médicaments.
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
              <p className="mb-3 text-sm font-medium text-slate-700">Symptômes</p>
              {symptoms.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun symptôme signalé aujourd’hui.</p>
              ) : (
                <ul className="space-y-2">
                  {symptoms.map((symptom) => (
                    <li
                      key={symptom.nom}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">
                          {symptom.nom}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {GRAVITE_OPTIONS.find((g) => g.value === symptom.gravite)?.label}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Retirer ${symptom.nom}`}
                        onClick={() =>
                          setSymptoms((current) => current.filter((s) => s.nom !== symptom.nom))
                        }
                        className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-200"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full py-2.5 text-sm"
                onClick={() => setSymptomSheet(true)}
              >
                Ajouter un symptôme
              </Button>
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
        <Button type="button" onClick={() => void handleSave()} disabled={busy || loading} className="w-full">
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

      {symptomSheet && (
        <SymptomSheet
          existing={symptoms}
          onClose={() => setSymptomSheet(false)}
          onAdd={(symptom) => {
            setSymptoms((current) => [...current, symptom])
            setSymptomSheet(false)
          }}
        />
      )}

      {crisisSheet && (
        <CrisisSheet
          dogId={dogId}
          onClose={() => setCrisisSheet(false)}
          onSaved={() => setCrisisSheet(false)}
        />
      )}
    </div>
  )
}

/** Liste catégorisée de symptômes : on choisit d'abord le symptôme, puis sa gravité. */
function SymptomSheet({
  existing,
  onClose,
  onAdd,
}: {
  existing: Symptom[]
  onClose: () => void
  onAdd: (symptom: Symptom) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [gravite, setGravite] = useState<Gravite>('leger')
  const alreadyAdded = new Set(existing.map((symptom) => symptom.nom))

  if (selected) {
    return (
      <Sheet title="Gravité" onClose={onClose}>
        <p className="mb-4 font-medium text-slate-900">{selected}</p>
        <SegmentedControl
          options={GRAVITE_OPTIONS}
          value={gravite}
          onChange={(value) => value && setGravite(value)}
        />
        <div className="mt-6 space-y-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => onAdd({ nom: selected, gravite })}
          >
            Ajouter ce symptôme
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full py-2.5 text-sm"
            onClick={() => setSelected(null)}
          >
            Retour à la liste
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Ajouter un symptôme" onClose={onClose}>
      <div className="space-y-5">
        {SYMPTOM_CATALOG.map((group) => (
          <div key={group.categorie}>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {group.categorie}
            </p>
            <div className="space-y-1.5">
              {group.symptomes.map((nom) => (
                <button
                  key={nom}
                  type="button"
                  disabled={alreadyAdded.has(nom)}
                  onClick={() => setSelected(nom)}
                  className="w-full rounded-xl bg-slate-50 px-3 py-3 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                >
                  {nom}
                  {alreadyAdded.has(nom) && ' — déjà signalé'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Compteur +/− . Quand il est effaçable, on peut revenir à « non renseigné ». */
function Compteur({
  libelle,
  nom,
  aide,
  valeur,
  effacable = false,
  onChange,
}: {
  libelle: string
  nom: string
  aide?: string
  valeur: number | null
  effacable?: boolean
  onChange: (valeur: number | null) => void
}) {
  const retirer = () => {
    if (valeur === null) return
    if (valeur === 0) onChange(effacable ? null : 0)
    else onChange(valeur - 1)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{libelle}</p>
        {aide && <p className="mt-0.5 text-xs text-slate-500">{aide}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label={`Retirer une ${nom}`}
          onClick={retirer}
          className="h-11 w-11 rounded-full bg-slate-100 text-2xl font-bold text-slate-700 hover:bg-slate-200"
        >
          −
        </button>
        <span className="w-8 text-center text-xl font-bold tabular-nums text-slate-900">
          {valeur ?? '—'}
        </span>
        <button
          type="button"
          aria-label={`Ajouter une ${nom}`}
          onClick={() => onChange(valeur === null ? 1 : valeur + 1)}
          className="h-11 w-11 rounded-full bg-slate-100 text-2xl font-bold text-slate-700 hover:bg-slate-200"
        >
          +
        </button>
      </div>
    </div>
  )
}
