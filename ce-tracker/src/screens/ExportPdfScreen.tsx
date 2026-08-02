import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, Dog, DogMedication, SuiviEvent, Weight } from '../lib/types'
import { BCS_SCALE } from '../data/catalogs'
import { calculerAge, formatLongDate, formatShortDate, formatTime, todayISO } from '../lib/date'
import { construireJours } from '../lib/journal'
import { Button, Card, ErrorMessage, Field, Spinner, inputClass } from '../components/ui'
import JourCard from '../components/JourCard'
import Logo from '../components/Logo'

type Props = { dog: Dog; onClose: () => void }

const PERIODES = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
]

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Journal imprimable à remettre au vétérinaire. Réutilise les mêmes cartes
 * de journée que l'onglet Historique (JourCard), en lecture seule, pour que
 * le document imprimé soit visuellement identique à l'application plutôt
 * qu'une mise en page distincte.
 *
 * Rendu hors de la coquille de l'application (pas de hauteur fixe ni de
 * scroll interne) : c'est ce qui permet à window.print() de sortir tout le
 * document plutôt que le seul écran visible, comme pour le dossier partagé
 * au vétérinaire. */
export default function ExportPdfScreen({ dog, onClose }: Props) {
  const [fin, setFin] = useState(todayISO())
  const [debut, setDebut] = useState(reculerDe(todayISO(), 89))
  const [presetActif, setPresetActif] = useState<number | null>(90)

  const [medications, setMedications] = useState<DogMedication[]>([])
  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [crises, setCrises] = useState<Crise[]>([])
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [poids, setPoids] = useState<Weight[]>([])
  const [error, setError] = useState<string | null>(null)

  function choisirPreset(jours: number) {
    setPresetActif(jours)
    setFin(todayISO())
    setDebut(reculerDe(todayISO(), jours - 1))
  }

  useEffect(() => {
    if (debut > fin) return
    setEntries(null)
    const debutEvenements = reculerDe(debut, 1)
    const debutTs = new Date(`${debutEvenements}T00:00:00`).toISOString()
    const finExclusive = new Date(`${fin}T00:00:00`)
    finExclusive.setDate(finExclusive.getDate() + 1)
    const finTs = finExclusive.toISOString()

    async function load() {
      const [m, e, c, ev, p] = await Promise.all([
        supabase.from('dog_medications').select('*').eq('dog_id', dog.id).order('actif', { ascending: false }),
        supabase
          .from('daily_entries')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('date', debut)
          .lte('date', fin)
          .order('date'),
        supabase.from('crises').select('*').eq('dog_id', dog.id).gte('date', debut).lte('date', fin).order('date'),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('at', debutTs)
          .lt('at', finTs)
          .order('at')
          .limit(5000),
        supabase.from('weights').select('*').eq('dog_id', dog.id).gte('date', debut).lte('date', fin).order('date'),
      ])
      const dbError = m.error ?? e.error ?? c.error ?? ev.error ?? p.error
      if (dbError) {
        setError(dbError.message)
        return
      }
      setMedications(m.data as DogMedication[])
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
      setEvents(ev.data as SuiviEvent[])
      setPoids(p.data as Weight[])
    }
    void load()
  }, [dog.id, debut, fin])

  const repasEvents = useMemo(() => events.filter((e) => e.type === 'repas'), [events])

  const jours = useMemo(
    () => construireJours(entries ?? [], crises, events, poids, debut, fin),
    [entries, crises, events, poids, debut, fin],
  )

  const actifs = medications.filter((m) => m.actif)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            ← Retour
          </button>
          <div className="flex items-center gap-2">
            {PERIODES.map((periode) => (
              <button
                key={periode.jours}
                type="button"
                aria-pressed={presetActif === periode.jours}
                onClick={() => choisirPreset(periode.jours)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  presetActif === periode.jours
                    ? 'bg-brand-700 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {periode.label}
              </button>
            ))}
            <Button type="button" variant="secondary" className="py-2 text-sm" onClick={() => window.print()}>
              Imprimer / PDF
            </Button>
          </div>
        </div>

        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Du">
              <input
                type="date"
                value={debut}
                max={fin}
                onChange={(e) => {
                  setDebut(e.target.value)
                  setPresetActif(null)
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Au">
              <input
                type="date"
                value={fin}
                min={debut}
                max={todayISO()}
                onChange={(e) => {
                  setFin(e.target.value)
                  setPresetActif(null)
                }}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>
      </header>

      <ErrorMessage>{error}</ErrorMessage>

      {debut > fin ? (
        <Card>
          <p className="py-4 text-center text-sm text-slate-500">
            La date de début doit précéder la date de fin.
          </p>
        </Card>
      ) : entries === null ? (
        <Spinner label="Préparation du journal…" />
      ) : (
        <>
          <div>
            <Logo taille={20} className="mb-2" />
            <h1 className="text-xl font-bold text-slate-900">{dog.name} — Journal de suivi</h1>
            <p className="text-sm text-slate-600">
              Entéropathie chronique · du {formatShortDate(debut)} au {formatShortDate(fin)} · généré le{' '}
              {formatShortDate(todayISO())}
            </p>
          </div>

          <Card className="break-inside-avoid">
            <h2 className="mb-2 font-bold text-slate-900">Fiche</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Ligne terme="Race" valeur={dog.race} />
              <Ligne terme="Âge" valeur={dog.date_naissance ? `${calculerAge(dog.date_naissance)} ans` : null} />
              <Ligne terme="Puce / tatouage" valeur={dog.identification} />
              <Ligne terme="Poids actuel" valeur={dog.poids_actuel !== null ? `${dog.poids_actuel} kg` : null} />
              <Ligne terme="Poids idéal" valeur={dog.poids_ideal !== null ? `${dog.poids_ideal} kg` : null} />
              <Ligne
                terme="BCS"
                valeur={
                  dog.bcs !== null ? `${dog.bcs}/9 — ${BCS_SCALE.find((b) => b.value === dog.bcs)?.label}` : null
                }
              />
              <Ligne
                terme="Diagnostic"
                valeur={dog.date_diagnostic ? formatLongDate(dog.date_diagnostic) : null}
              />
            </dl>
          </Card>

          <Card className="break-inside-avoid">
            <h2 className="mb-2 font-bold text-slate-900">Traitements en cours</h2>
            {actifs.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun médicament actif.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {actifs.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="text-slate-800">
                      {m.nom_medicament}
                      {m.dose && <span className="text-slate-500"> · {m.dose}</span>}
                    </span>
                    {m.heure_prise && (
                      <span className="shrink-0 tabular-nums text-slate-500">{formatTime(m.heure_prise)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div>
            <h2 className="mb-2 px-1 font-bold text-slate-900">Journal chronologique</h2>
            {jours.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">Aucune saisie sur cette période.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {jours.map((jour) => (
                  <JourCard key={jour.date} jour={jour} repas={repasEvents} />
                ))}
              </div>
            )}
          </div>

          <p className="pb-6 text-center text-xs text-slate-400 print:hidden">
            Document généré depuis appeic. Les données sont déclaratives.
          </p>
        </>
      )}
    </div>
  )
}

function Ligne({ terme, valeur }: { terme: string; valeur: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{terme}</dt>
      <dd className="font-medium text-slate-900">{valeur ?? '—'}</dd>
    </div>
  )
}
