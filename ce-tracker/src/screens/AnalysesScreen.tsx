import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, SuiviEvent } from '../lib/types'
import { formatShortDate, todayISO } from '../lib/date'
import { Card, ErrorMessage, Field, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

const PERIODES = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
]

type Jour = { date: string; label: string }

/** Jour local d'un horodatage, au format YYYY-MM-DD. */
function jourDe(at: string): string {
  const d = new Date(at)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

// L'onglet est démonté à chaque changement d'onglet (rendu conditionnel dans
// App.tsx) : sans persistance, la période choisie serait perdue et
// reviendrait à 30 j par défaut à chaque retour sur Analyses.
const STOCKAGE_CLE = 'appeic.analyses.periode'

function chargerPeriode(): { presetActif: number | null; debut: string; fin: string } {
  try {
    const brut = localStorage.getItem(STOCKAGE_CLE)
    const donnees = brut ? JSON.parse(brut) : null
    if (donnees && typeof donnees.debut === 'string' && typeof donnees.fin === 'string') {
      return {
        presetActif: typeof donnees.presetActif === 'number' ? donnees.presetActif : null,
        debut: donnees.debut,
        fin: donnees.fin,
      }
    }
  } catch {
    // Stockage indisponible ou corrompu : on repart des valeurs par défaut.
  }
  return { presetActif: 30, debut: reculerDe(todayISO(), 29), fin: todayISO() }
}

/** Tous les jours entre deux dates incluses, y compris ceux sans donnée :
 * les creux restent visibles plutôt que d'être passés sous silence. */
function joursEntre(debut: string, fin: string): Jour[] {
  if (debut > fin) return []
  const liste: Jour[] = []
  const curseur = new Date(debut)
  const arrivee = new Date(fin)
  while (curseur <= arrivee) {
    const iso = curseur.toISOString().slice(0, 10)
    liste.push({ date: iso, label: formatShortDate(iso) })
    curseur.setDate(curseur.getDate() + 1)
  }
  return liste
}

export default function AnalysesScreen({ dogId }: Props) {
  const [fin, setFin] = useState(() => chargerPeriode().fin)
  const [debut, setDebut] = useState(() => chargerPeriode().debut)
  const [presetActif, setPresetActif] = useState<number | null>(() => chargerPeriode().presetActif)

  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [crises, setCrises] = useState<Crise[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STOCKAGE_CLE, JSON.stringify({ presetActif, debut, fin }))
    } catch {
      // Navigation privée ou quota plein : la période ne persiste pas, sans bloquer l'app.
    }
  }, [presetActif, debut, fin])

  useEffect(() => {
    if (debut > fin) return
    setEntries(null)
    async function load() {
      // Bornes en heure locale, comme le journal quotidien : une comparaison
      // directe de la date au timestamptz aurait raisonné en UTC et pu
      // exclure ou inclure à tort les événements proches de minuit.
      const debutTs = new Date(`${debut}T00:00:00`).toISOString()
      const finExclusive = new Date(`${fin}T00:00:00`)
      finExclusive.setDate(finExclusive.getDate() + 1)
      const finTs = finExclusive.toISOString()

      // Bornée à la période choisie : sur la totalité de l'historique du
      // chien, une requête sans borne dépassait la limite de lignes de
      // Supabase et coupait silencieusement les événements les plus récents.
      const [e, c, ev] = await Promise.all([
        supabase
          .from('daily_entries')
          .select('*')
          .eq('dog_id', dogId)
          .gte('date', debut)
          .lte('date', fin)
          .order('date'),
        // Chevauchement avec la fenêtre plutôt qu'une simple borne sur
        // date_debut : une crise commencée avant mais toujours en cours (ou
        // résolue après le début de la fenêtre) doit rester visible.
        supabase
          .from('crises')
          .select('*')
          .eq('dog_id', dogId)
          .lte('date_debut', fin)
          .or(`date_fin.is.null,date_fin.gte.${debut}`)
          .order('date_debut'),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dogId)
          .gte('at', debutTs)
          .lt('at', finTs)
          .order('at')
          .limit(5000),
      ])
      if (e.error || c.error || ev.error) {
        setError((e.error ?? c.error ?? ev.error)!.message)
        return
      }
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
      setEvents(ev.data as SuiviEvent[])
    }
    void load()
  }, [dogId, debut, fin])

  function choisirPreset(jours: number) {
    setPresetActif(jours)
    setFin(todayISO())
    setDebut(reculerDe(todayISO(), jours - 1))
  }

  const fenetre = useMemo(() => joursEntre(debut, fin), [debut, fin])
  const nbJours = fenetre.length

  const refluxPoints = useMemo(() => {
    const parJour = new Map<string, number>()
    for (const event of events) {
      if (event.type === 'symptome' && event.nom === 'Reflux') {
        const j = jourDe(event.at)
        parJour.set(j, (parJour.get(j) ?? 0) + 1)
      }
    }
    return fenetre.map((j) => ({ ...j, compte: parJour.get(j.date) ?? 0 }))
  }, [events, fenetre])

  const crisesPoints = useMemo(() => {
    // Une crise dure de date_debut à date_fin (ou jusqu'à aujourd'hui si
    // encore en cours) : chaque jour de l'épisode compte comme « en crise »,
    // pas seulement le jour où elle a été signalée.
    return fenetre.map((j) => ({
      ...j,
      compte: crises.some((c) => j.date >= c.date_debut && j.date <= (c.date_fin ?? fin)) ? 1 : 0,
    }))
  }, [crises, fenetre, fin])

  const scorePoints = useMemo(() => {
    const parDateEntry = new Map(entries?.map((entry) => [entry.date, entry]) ?? [])
    const sellesParJour = new Map<string, number[]>()
    for (const event of events) {
      if (event.type === 'selle' && event.intensite !== null) {
        const j = jourDe(event.at)
        sellesParJour.set(j, [...(sellesParJour.get(j) ?? []), event.intensite])
      }
    }
    return fenetre.map((j) => {
      const duJour = sellesParJour.get(j.date)
      const entry = parDateEntry.get(j.date)
      // Le pire score de la journée : c'est lui qui décrit l'état du chien.
      return { ...j, score: duJour ? Math.max(...duJour) : (entry?.score_fecal ?? null) }
    })
  }, [entries, events, fenetre])

  const totalReflux = refluxPoints.reduce((s, p) => s + p.compte, 0)
  const totalCrises = crisesPoints.reduce((s, p) => s + p.compte, 0)
  const scoresConnus = scorePoints.filter((p) => p.score !== null)
  const scoreMoyen =
    scoresConnus.length > 0
      ? scoresConnus.reduce((s, p) => s + p.score!, 0) / scoresConnus.length
      : null

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-2">
        {PERIODES.map((periode) => (
          <button
            key={periode.jours}
            type="button"
            aria-pressed={presetActif === periode.jours}
            onClick={() => choisirPreset(periode.jours)}
            className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
              presetActif === periode.jours
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {periode.label}
          </button>
        ))}
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

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {debut > fin ? (
        <Card>
          <p className="py-4 text-center text-sm text-slate-500">
            La date de début doit précéder la date de fin.
          </p>
        </Card>
      ) : entries === null ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-700">Reflux</p>
              <p className="text-sm tabular-nums text-slate-500">
                {totalReflux} sur {nbJours} jour{nbJours > 1 ? 's' : ''}
              </p>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={refluxPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(label) => `Le ${label}`}
                    formatter={(v) => [v, 'reflux']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Bar dataKey="compte" name="Reflux" fill="#b4cded" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-700">Crises</p>
              <p className="text-sm tabular-nums text-slate-500">
                {totalCrises} sur {nbJours} jour{nbJours > 1 ? 's' : ''}
              </p>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crisesPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(label) => `Le ${label}`}
                    formatter={(v) => [v, 'crise']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Bar dataKey="compte" name="Crises" fill="#c0524b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-700">Score fécal</p>
              <p className="text-sm tabular-nums text-slate-500">
                {scoreMoyen !== null ? `moyenne ${scoreMoyen.toFixed(1)}` : 'aucune donnée'}
              </p>
            </div>
            {scoresConnus.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Aucune donnée sur cette période.
              </p>
            ) : (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scorePoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      domain={[1, 7]}
                      ticks={[1, 2, 3, 4, 5, 6, 7]}
                      tick={{ fontSize: 11 }}
                      width={28}
                    />
                    <Tooltip
                      labelFormatter={(label) => `Le ${label}`}
                      formatter={(v) => [v, 'score']}
                      contentStyle={{ fontSize: 12, borderRadius: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      name="Score fécal"
                      stroke="#344966"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Échelle de Purina, de 1 (très dure) à 7 (liquide). Le plus élevé de la journée.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
