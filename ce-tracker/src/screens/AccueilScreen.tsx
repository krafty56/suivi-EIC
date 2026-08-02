import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Appetit,
  Appointment,
  DailyEntry,
  Dog,
  DogMedication,
  Energie,
  SuiviEvent,
} from '../lib/types'
import { APPETIT_OPTIONS, ENERGIE_OPTIONS, resumeDetailsEvenement } from '../data/catalogs'
import { LABEL_TYPE_EVENEMENT } from '../data/events'
import { emojiEvenement } from '../data/emoji'
import { formatLongDate, formatTime, heureDe, todayISO } from '../lib/date'
import { stoolPhotoUrl } from '../lib/storage'
import { Button, Card, ErrorMessage, Sheet, Spinner } from '../components/ui'
import CrisisSheet from './CrisisSheet'

type Props = { dog: Dog }

function libelleAppetit(v: Appetit | null): string | null {
  return v ? (APPETIT_OPTIONS.find((o) => o.value === v)?.label ?? v) : null
}

function libelleEnergie(v: Energie | null): string | null {
  return v ? (ENERGIE_OPTIONS.find((o) => o.value === v)?.label ?? v) : null
}

/** Le récapitulatif du jour, en lecture seule : ce qui a déjà été saisi.
 * La correction ou l'ajout d'une entrée se fait dans l'onglet Saisir. */
export default function AccueilScreen({ dog }: Props) {
  const [events, setEvents] = useState<SuiviEvent[] | null>(null)
  const [entry, setEntry] = useState<DailyEntry | null>(null)
  const [medications, setMedications] = useState<DogMedication[]>([])
  const [takenMeds, setTakenMeds] = useState<Set<string>>(new Set())
  const [prochainRdv, setProchainRdv] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [crisisSheet, setCrisisSheet] = useState(false)
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)

  useEffect(() => {
    const date = todayISO()
    const debut = new Date(`${date}T00:00:00`)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 1)

    async function charger() {
      const [eventsResult, entryResult, medsResult, rdvResult] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('at', debut.toISOString())
          .lt('at', fin.toISOString())
          .order('at', { ascending: false }),
        supabase.from('daily_entries').select('*').eq('dog_id', dog.id).eq('date', date).maybeSingle(),
        supabase
          .from('dog_medications')
          .select('*')
          .eq('dog_id', dog.id)
          .eq('actif', true)
          .order('heure_prise', { ascending: true, nullsFirst: false }),
        supabase
          .from('appointments')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('date', date)
          .order('date', { ascending: true })
          .order('heure', { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ])

      const dbError = eventsResult.error ?? entryResult.error ?? medsResult.error ?? rdvResult.error
      if (dbError) {
        setError(dbError.message)
        return
      }
      setEvents(eventsResult.data as SuiviEvent[])
      const dailyEntry = entryResult.data as DailyEntry | null
      setEntry(dailyEntry)
      setMedications(medsResult.data as DogMedication[])
      setProchainRdv(rdvResult.data as Appointment | null)

      // La checklist du jour (Saisir) et les événements traitement horodatés
      // sont deux façons d'enregistrer une prise : les deux comptent ici.
      if (dailyEntry) {
        const { data: logs, error: logsError } = await supabase
          .from('medication_logs')
          .select('dog_medication_id, pris')
          .eq('daily_entry_id', dailyEntry.id)

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
    }

    void charger()
  }, [dog.id])

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (events === null) return <Spinner />

  const comptes = (['symptome', 'selle', 'repas', 'activite'] as const).map((type) => ({
    type,
    label: LABEL_TYPE_EVENEMENT[type],
    compte: events.filter((e) => e.type === type).length,
  }))

  const priseAujourdhui = (medicationId: string) =>
    takenMeds.has(medicationId) ||
    events.some((e) => e.type === 'traitement' && e.dog_medication_id === medicationId)

  return (
    <div className="space-y-4 p-4 pb-8">
      <div>
        <p className="text-sm text-slate-500 capitalize">{formatLongDate(todayISO())}</p>
        <h2 className="text-xl font-bold text-slate-900">Bonjour, voici la journée de {dog.name}</h2>
      </div>

      {prochainRdv && (
        <Card>
          <p className="mb-1 text-sm font-medium text-slate-700">📅 Prochain rendez-vous</p>
          <p className="font-bold text-slate-900 capitalize">
            {formatLongDate(prochainRdv.date)}
            {prochainRdv.heure && (
              <span className="font-normal text-slate-600"> à {formatTime(prochainRdv.heure)}</span>
            )}
          </p>
          <p className="text-sm text-slate-600">
            {prochainRdv.motif}
            {prochainRdv.clinique && <span className="text-slate-500"> · {prochainRdv.clinique}</span>}
          </p>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-4 divide-x divide-slate-200 text-center">
          {comptes.map((c) => (
            <div key={c.type}>
              <p className="text-xl font-bold tabular-nums text-slate-900">{c.compte}</p>
              <p className="text-xs text-slate-500">{c.label.toLowerCase()}s</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-slate-700">Médicaments</p>
        {medications.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun médicament actif.</p>
        ) : (
          <div className="space-y-2">
            {medications.map((m) => {
              const pris = priseAujourdhui(m.id)
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                    pris ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200'
                  }`}
                >
                  <span className="shrink-0 text-xl" aria-hidden="true">
                    💊
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">
                      {m.nom_medicament}
                    </span>
                    {m.heure_prise && (
                      <span className="block text-xs text-slate-500">
                        Prévu à {formatTime(m.heure_prise)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      pris ? 'text-brand-700' : 'text-slate-400'
                    }`}
                  >
                    {pris ? '✓ Donné' : 'À donner'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-700">Bilan</p>
        {entry?.appetit || entry?.energie ? (
          <div className="flex gap-4 text-sm text-slate-700">
            {entry.appetit && <p>Appétit : {libelleAppetit(entry.appetit)}</p>}
            {entry.energie && <p>Énergie : {libelleEnergie(entry.energie)}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Pas encore renseigné aujourd’hui. Rendez-vous dans l’onglet Saisir.
          </p>
        )}
      </Card>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Entrées du jour
        </p>
        <Card className="p-0">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucune entrée pour l’instant aujourd’hui.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 text-xl" aria-hidden="true">
                    {emojiEvenement(event.type, event.nom)}
                  </span>
                  {event.type === 'selle' && event.storage_path && (
                    <button type="button" onClick={() => setZoomed(event)} className="shrink-0">
                      <img
                        src={stoolPhotoUrl(event.storage_path)}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    </button>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{event.nom}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {event.categorie ?? LABEL_TYPE_EVENEMENT[event.type]}
                      {resumeDetailsEvenement(event.type, event.details) &&
                        ` · ${resumeDetailsEvenement(event.type, event.details)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-500">
                    {heureDe(event.at)}
                  </span>
                  {event.intensite !== null && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {event.intensite}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Button
        type="button"
        variant="danger"
        className="w-full py-2.5 text-sm"
        onClick={() => setCrisisSheet(true)}
      >
        🚨 Signaler une crise
      </Button>

      {crisisSheet && (
        <CrisisSheet
          dogId={dog.id}
          onClose={() => setCrisisSheet(false)}
          onSaved={() => setCrisisSheet(false)}
        />
      )}

      {zoomed && zoomed.storage_path && (
        <Sheet title={zoomed.nom} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
        </Sheet>
      )}
    </div>
  )
}
