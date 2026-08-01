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
import { Card, ErrorMessage, Spinner } from '../components/ui'

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

/** Tous les jours de la fenêtre, y compris ceux sans donnée : les creux
 * restent visibles plutôt que d'être passés sous silence. */
function joursDeLaFenetre(jours: number): Jour[] {
  const fin = new Date(todayISO())
  const liste: Jour[] = []
  for (let i = jours - 1; i >= 0; i--) {
    const jour = new Date(fin)
    jour.setDate(fin.getDate() - i)
    const iso = jour.toISOString().slice(0, 10)
    liste.push({ date: iso, label: formatShortDate(iso) })
  }
  return liste
}

export default function AnalysesScreen({ dogId }: Props) {
  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [crises, setCrises] = useState<Crise[]>([])
  const [jours, setJours] = useState(30)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [e, c, ev] = await Promise.all([
        supabase.from('daily_entries').select('*').eq('dog_id', dogId).order('date'),
        supabase.from('crises').select('*').eq('dog_id', dogId).order('date'),
        supabase.from('events').select('*').eq('dog_id', dogId).order('at'),
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
  }, [dogId])

  const fenetre = useMemo(() => joursDeLaFenetre(jours), [jours])

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
    const parJour = new Map<string, number>()
    for (const crise of crises) {
      parJour.set(crise.date, (parJour.get(crise.date) ?? 0) + 1)
    }
    return fenetre.map((j) => ({ ...j, compte: parJour.get(j.date) ?? 0 }))
  }, [crises, fenetre])

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

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (entries === null) return <Spinner />

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
            aria-pressed={jours === periode.jours}
            onClick={() => setJours(periode.jours)}
            className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
              jours === periode.jours
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {periode.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-slate-700">Reflux</p>
          <p className="text-sm tabular-nums text-slate-500">
            {totalReflux} sur {jours === 365 ? '1 an' : `${jours} jours`}
          </p>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={refluxPoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={24} />
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
            {totalCrises} sur {jours === 365 ? '1 an' : `${jours} jours`}
          </p>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={crisesPoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={24} />
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
          <p className="py-8 text-center text-sm text-slate-500">Aucune donnée sur cette période.</p>
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scorePoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[1, 7]} ticks={[1, 2, 3, 4, 5, 6, 7]} tick={{ fontSize: 11 }} width={24} />
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
    </div>
  )
}
