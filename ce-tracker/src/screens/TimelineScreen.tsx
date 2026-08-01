import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry } from '../lib/types'
import { formatShortDate, todayISO } from '../lib/date'
import { Card, ErrorMessage, Spinner } from '../components/ui'

type Props = { dogId: string }

const PERIODES = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
]

type Point = {
  date: string
  label: string
  score: number | null
  vomissements: number | null
  symptomes: number | null
}

/** Toutes les dates de la fenêtre, y compris celles sans saisie : les trous restent visibles. */
function buildSeries(entries: DailyEntry[], jours: number): Point[] {
  const parDate = new Map(entries.map((entry) => [entry.date, entry]))
  const points: Point[] = []
  const fin = new Date(todayISO())

  for (let i = jours - 1; i >= 0; i--) {
    const jour = new Date(fin)
    jour.setDate(fin.getDate() - i)
    const iso = jour.toISOString().slice(0, 10)
    const entry = parDate.get(iso)
    points.push({
      date: iso,
      label: formatShortDate(iso),
      score: entry?.score_fecal ?? null,
      vomissements: entry ? entry.vomissements_count : null,
      symptomes: entry ? entry.symptoms.length : null,
    })
  }
  return points
}

export default function TimelineScreen({ dogId }: Props) {
  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [crises, setCrises] = useState<Crise[]>([])
  const [jours, setJours] = useState(30)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [e, c] = await Promise.all([
        supabase.from('daily_entries').select('*').eq('dog_id', dogId).order('date'),
        supabase.from('crises').select('*').eq('dog_id', dogId).order('date'),
      ])
      if (e.error || c.error) {
        setError((e.error ?? c.error)!.message)
        return
      }
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
    }
    void load()
  }, [dogId])

  const points = useMemo(() => (entries ? buildSeries(entries, jours) : []), [entries, jours])
  const crisesVisibles = useMemo(() => {
    const dates = new Set(points.map((p) => p.date))
    return crises.filter((crise) => dates.has(crise.date))
  }, [crises, points])

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (entries === null) return <Spinner />

  const avecDonnees = points.some((p) => p.score !== null || p.vomissements !== null)

  return (
    <div className="space-y-3 p-4">
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
        {!avecDonnees ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Aucune donnée sur cette période.
          </p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis
                  yAxisId="score"
                  domain={[1, 7]}
                  ticks={[1, 2, 3, 4, 5, 6, 7]}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="compte"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(label) => `Le ${label}`}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {crisesVisibles.map((crise) => (
                  <ReferenceLine
                    key={crise.id}
                    yAxisId="score"
                    x={formatShortDate(crise.date)}
                    stroke="#c0524b"
                    strokeDasharray="4 2"
                    label={{ value: 'crise', fontSize: 10, fill: '#c0524b', position: 'top' }}
                  />
                ))}
                <Bar
                  yAxisId="compte"
                  dataKey="vomissements"
                  name="Vomissements"
                  fill="#d9a45b"
                  barSize={8}
                />
                <Line
                  yAxisId="compte"
                  type="monotone"
                  dataKey="symptomes"
                  name="Symptômes"
                  stroke="#b4cded"
                  strokeWidth={2.75}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="score"
                  name="Score fécal"
                  stroke="#344966"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-sm font-medium text-slate-700">Lecture</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Axe de gauche : score fécal, de 1 (très dur) à 7 (liquide).</li>
          <li>Axe de droite : nombre de vomissements et de symptômes signalés.</li>
          <li>Trait rouge vertical : crise signalée ce jour-là.</li>
          <li>Les interruptions de courbe correspondent aux jours sans saisie.</li>
        </ul>
      </Card>
    </div>
  )
}
