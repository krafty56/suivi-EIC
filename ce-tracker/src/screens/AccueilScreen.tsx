import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Absence,
  Appetit,
  Appointment,
  Crise,
  DailyEntry,
  Dog,
  DogMedication,
  Energie,
  QualiteVie,
  SuiviEvent,
} from '../lib/types'
import {
  APPETIT_OPTIONS,
  ENERGIE_OPTIONS,
  QUANTITE_REPAS_OPTIONS,
  QUANTITE_TONE_CLASSES,
  resumeDetailsEvenement,
} from '../data/catalogs'
import { LABEL_TYPE_EVENEMENT } from '../data/events'
import { emojiEvenement } from '../data/emoji'
import { detecterAlertes } from '../lib/alertes'
import {
  formatLongDate,
  formatPlageAbsence,
  formatShortDate,
  formatTime,
  heureDe,
  joursDepuis,
  todayISO,
} from '../lib/date'
import { usePremium } from '../lib/premium'
import { stoolPhotoUrl } from '../lib/storage'
import { Button, Card, ErrorMessage, Sheet, Spinner } from '../components/ui'
import { Verrou } from '../components/Verrou'
import AbsenceSheet from './AbsenceSheet'
import CrisisSheet from './CrisisSheet'
import QualiteVieSheet from './QualiteVieSheet'

type Props = { dog: Dog }

function libelleAppetit(v: Appetit | null): string | null {
  return v ? (APPETIT_OPTIONS.find((o) => o.value === v)?.label ?? v) : null
}

function libelleEnergie(v: Energie | null): string | null {
  return v ? (ENERGIE_OPTIONS.find((o) => o.value === v)?.label ?? v) : null
}

/** Pluriel d'un libellé de type d'événement pour le résumé du jour : un mot
 * qui finit déjà en s/x/z (« Repas ») ne prend pas de s supplémentaire. */
function pluriel(label: string): string {
  const mot = label.toLowerCase()
  return /[sxz]$/.test(mot) ? mot : `${mot}s`
}

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Le récapitulatif du jour, en lecture seule : ce qui a déjà été saisi.
 * La correction ou l'ajout d'une entrée se fait dans l'onglet Saisir. */
export default function AccueilScreen({ dog }: Props) {
  const { isPremium } = usePremium()
  const [events, setEvents] = useState<SuiviEvent[] | null>(null)
  const [entry, setEntry] = useState<DailyEntry | null>(null)
  const [events7j, setEvents7j] = useState<SuiviEvent[]>([])
  const [entries7j, setEntries7j] = useState<DailyEntry[]>([])
  const [medications, setMedications] = useState<DogMedication[]>([])
  const [takenMeds, setTakenMeds] = useState<Set<string>>(new Set())
  const [prochainRdv, setProchainRdv] = useState<Appointment | null>(null)
  const [derniereCrise, setDerniereCrise] = useState<Crise | null | undefined>(undefined)
  const [derniereAbsence, setDerniereAbsence] = useState<Absence | null>(null)
  // Dix dernières entrées : assez pour la bande de tendance, jamais bloquant
  // si la table n'est pas encore déployée (voir le fail-soft plus bas).
  const [qualiteVie, setQualiteVie] = useState<QualiteVie[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [crisisSheetMode, setCrisisSheetMode] = useState<'nouvelle' | 'modifier' | null>(null)
  const [absenceSheetMode, setAbsenceSheetMode] = useState<'nouvelle' | 'modifier' | null>(null)
  const [qualiteVieSheetOuverte, setQualiteVieSheetOuverte] = useState(false)
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)
  const [refreshSignal, setRefreshSignal] = useState(0)

  useEffect(() => {
    const date = todayISO()
    const debut = new Date(`${date}T00:00:00`)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 1)
    // Fenêtre plus large pour les alertes cliniques : une répétition ou une
    // tendance ne se voit pas sur la seule journée en cours.
    const debut7j = reculerDe(date, 6)

    async function charger() {
      const [
        eventsResult,
        entryResult,
        medsResult,
        rdvResult,
        criseResult,
        absenceResult,
        qualiteVieResult,
        events7jResult,
        entries7jResult,
      ] = await Promise.all([
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
          supabase
            .from('crises')
            .select('*')
            .eq('dog_id', dog.id)
            .order('date_debut', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('absences')
            .select('*')
            .eq('dog_id', dog.id)
            .order('date_debut', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('qualite_vie')
            .select('*')
            .eq('dog_id', dog.id)
            .order('date', { ascending: false })
            .limit(10),
          supabase
            .from('events')
            .select('*')
            .eq('dog_id', dog.id)
            .gte('at', `${debut7j}T00:00:00`)
            .lt('at', fin.toISOString())
            .order('at'),
          supabase.from('daily_entries').select('*').eq('dog_id', dog.id).gte('date', debut7j).lte('date', date),
        ])

      const dbError =
        eventsResult.error ??
        entryResult.error ??
        medsResult.error ??
        rdvResult.error ??
        criseResult.error ??
        events7jResult.error ??
        entries7jResult.error
      if (dbError) {
        setError(dbError.message)
        return
      }
      setEvents(eventsResult.data as SuiviEvent[])
      const dailyEntry = entryResult.data as DailyEntry | null
      setEntry(dailyEntry)
      setMedications(medsResult.data as DogMedication[])
      setProchainRdv(rdvResult.data as Appointment | null)
      setDerniereCrise(criseResult.data as Crise | null)
      // Erreur ignorée plutôt que bloquante : le reste de l'écran ne doit pas
      // dépendre du déploiement de la table absences (ou de qualite_vie).
      setDerniereAbsence(absenceResult.error ? null : (absenceResult.data as Absence | null))
      setQualiteVie(qualiteVieResult.error ? [] : (qualiteVieResult.data as QualiteVie[]))
      setEvents7j(events7jResult.data as SuiviEvent[])
      setEntries7j(entries7jResult.data as DailyEntry[])

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
  }, [dog.id, refreshSignal])

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (events === null) return <Spinner />

  const comptes = (['symptome', 'selle', 'repas'] as const).map((type) => ({
    type,
    label: LABEL_TYPE_EVENEMENT[type],
    compte: events.filter((e) => e.type === type).length,
  }))

  const priseAujourdhui = (medicationId: string) =>
    takenMeds.has(medicationId) ||
    events.some((e) => e.type === 'traitement' && e.dog_medication_id === medicationId)

  const enCrise = derniereCrise ? derniereCrise.date_fin === null : false
  const joursSansCrise = derniereCrise?.date_fin ? joursDepuis(derniereCrise.date_fin) : null
  const absenceEnCours = derniereAbsence?.date_fin === null ? derniereAbsence : null
  const alertes =
    derniereCrise !== undefined ? detecterAlertes(events7j, entries7j, derniereCrise) : []
  const debutSemaine = reculerDe(todayISO(), 6)
  const qualiteVieCetteSemaine = qualiteVie?.find((q) => q.date >= debutSemaine) ?? null

  return (
    <div className="space-y-4 p-4 pb-8">
      <div>
        <p className="text-sm text-slate-500 capitalize">{formatLongDate(todayISO())}</p>
        <h2 className="text-xl font-bold text-slate-900">Bonjour, voici la journée de {dog.name}</h2>
      </div>

      {qualiteVie !== null && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                🐾
              </span>
              <div>
                <p className="text-sm font-medium text-slate-700">Qualité de vie</p>
                {qualiteVieCetteSemaine ? (
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {qualiteVieCetteSemaine.score}/10
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Pas encore évaluée cette semaine</p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 py-2 text-xs"
              onClick={() => setQualiteVieSheetOuverte(true)}
            >
              {qualiteVieCetteSemaine ? 'Modifier' : 'Évaluer'}
            </Button>
          </div>
          {qualiteVie.length > 1 && (
            <div className="mt-3 flex gap-1.5">
              {[...qualiteVie].reverse().map((q) => (
                <span
                  key={q.id}
                  title={`${formatShortDate(q.date)} — ${q.score}/10`}
                  className={`h-2.5 flex-1 rounded-full ${
                    q.score <= 3 ? 'bg-red-500' : q.score <= 6 ? 'bg-amber-500' : 'bg-emerald-600'
                  }`}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {alertes.length > 0 && !isPremium && (
        <Verrou
          titre="Alertes cliniques"
          description="Un signal a été repéré dans les données de la semaine (vomissements répétés, reflux fréquents, score fécal en dégradation ou crise prolongée) — réservé au premium."
        />
      )}

      {isPremium &&
        alertes.map((a) => (
          <Card key={a.id} className="bg-red-50 ring-2 ring-red-200">
            <p className="text-sm font-bold text-red-800">⚠️ {a.titre}</p>
            <p className="mt-1 text-sm text-red-700">{a.description}</p>
          </Card>
        ))}

      {derniereCrise !== undefined && (
        <Card className={enCrise ? 'ring-2 ring-red-200' : ''}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                {!derniereCrise ? '🛡️' : enCrise ? '🚨' : joursSansCrise !== null && joursSansCrise < 7 ? '⚠️' : '🛡️'}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {!derniereCrise
                    ? 'Aucune crise enregistrée'
                    : enCrise
                      ? `En crise depuis le ${formatShortDate(derniereCrise.date_debut)}`
                      : 'Jours sans crise'}
                </p>
                {derniereCrise && !enCrise && joursSansCrise !== null && (
                  <p className="text-2xl font-bold tabular-nums text-slate-900">{joursSansCrise}</p>
                )}
              </div>
            </div>
            {enCrise && (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 py-2 text-xs"
                onClick={() => setCrisisSheetMode('modifier')}
              >
                Clôturer
              </Button>
            )}
          </div>
        </Card>
      )}

      {absenceEnCours && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                🧳
              </span>
              <div>
                <p className="text-sm font-medium text-slate-700">{formatPlageAbsence(absenceEnCours)}</p>
                <p className="text-xs text-slate-500">Aucun symptôme ne peut être noté comme fiable.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 py-2 text-xs"
              onClick={() => setAbsenceSheetMode('modifier')}
            >
              Clôturer
            </Button>
          </div>
        </Card>
      )}

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
        <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
          {comptes.map((c) => (
            <div key={c.type}>
              <p className="text-xl font-bold tabular-nums text-slate-900">{c.compte}</p>
              <p className="text-xs text-slate-500">{pluriel(c.label)}</p>
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
                <li key={event.id} className="flex items-center gap-2 px-4 py-3">
                  <span className="shrink-0 text-xl" aria-hidden="true">
                    {typeof event.details.emoji === 'string'
                      ? event.details.emoji
                      : emojiEvenement(event.type, event.nom)}
                  </span>
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
                  <span className="flex w-9 shrink-0 justify-center">
                    {event.intensite !== null ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
                        {event.intensite}
                      </span>
                    ) : (
                      event.type === 'repas' &&
                      (() => {
                        const q = QUANTITE_REPAS_OPTIONS.find((o) => o.value === event.details.quantite)
                        return q ? (
                          <span
                            className={`h-3 w-3 rounded-full ${QUANTITE_TONE_CLASSES[q.tone].dot}`}
                            title={q.label}
                            aria-label={q.label}
                          />
                        ) : null
                      })()
                    )}
                  </span>
                  <span className="w-8 shrink-0">
                    {event.type === 'selle' && event.storage_path && (
                      <button type="button" onClick={() => setZoomed(event)}>
                        <img
                          src={stoolPhotoUrl(event.storage_path)}
                          alt=""
                          className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="danger"
          className="py-2.5 text-sm"
          onClick={() => setCrisisSheetMode('nouvelle')}
        >
          🚨 Signaler une crise
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="py-2.5 text-sm"
          onClick={() => setAbsenceSheetMode('nouvelle')}
        >
          🧳 Signaler une absence
        </Button>
      </div>

      {crisisSheetMode && (
        <CrisisSheet
          dogId={dog.id}
          crise={crisisSheetMode === 'modifier' && derniereCrise ? derniereCrise : undefined}
          onClose={() => setCrisisSheetMode(null)}
          onSaved={() => {
            setCrisisSheetMode(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}

      {absenceSheetMode && (
        <AbsenceSheet
          dogId={dog.id}
          absence={absenceSheetMode === 'modifier' && absenceEnCours ? absenceEnCours : undefined}
          onClose={() => setAbsenceSheetMode(null)}
          onSaved={() => {
            setAbsenceSheetMode(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}

      {zoomed && zoomed.storage_path && (
        <Sheet title={zoomed.nom} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
        </Sheet>
      )}

      {qualiteVieSheetOuverte && (
        <QualiteVieSheet
          dogId={dog.id}
          dogName={dog.name}
          entree={qualiteVieCetteSemaine}
          onClose={() => setQualiteVieSheetOuverte(false)}
          onSaved={() => {
            setQualiteVieSheetOuverte(false)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
