import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, SuiviEvent } from '../lib/types'
import { APPETIT_OPTIONS, CHANGEMENT_OPTIONS, ENERGIE_OPTIONS, GRAVITE_OPTIONS } from '../data/catalogs'
import { formatLongDate } from '../lib/date'
import { Card, ErrorMessage, Spinner } from '../components/ui'

type Props = { dogId: string }

type Day = {
  date: string
  entry: DailyEntry | null
  crises: Crise[]
  events: SuiviEvent[]
}

/** Jour local d'un horodatage. */
function jourDe(at: string): string {
  const d = new Date(at)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function HistoryScreen({ dogId }: Props) {
  const [days, setDays] = useState<Day[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [entriesResult, crisesResult, eventsResult] = await Promise.all([
        supabase
          .from('daily_entries')
          .select('*')
          .eq('dog_id', dogId)
          .order('date', { ascending: false }),
        supabase.from('crises').select('*').eq('dog_id', dogId).order('date', { ascending: false }),
        supabase.from('events').select('*').eq('dog_id', dogId).order('at', { ascending: false }),
      ])

      if (entriesResult.error || crisesResult.error || eventsResult.error) {
        setError((entriesResult.error ?? crisesResult.error ?? eventsResult.error)!.message)
        return
      }

      const entries = entriesResult.data as DailyEntry[]
      const crises = crisesResult.data as Crise[]
      const events = eventsResult.data as SuiviEvent[]

      // Une ligne par date, qu'elle porte une saisie quotidienne, une crise, ou les deux.
      const dates = [
        ...new Set([
          ...entries.map((e) => e.date),
          ...crises.map((c) => c.date),
          ...events.map((e) => jourDe(e.at)),
        ]),
      ].sort(
        (a, b) => b.localeCompare(a),
      )

      setDays(
        dates.map((date) => ({
          date,
          entry: entries.find((entry) => entry.date === date) ?? null,
          crises: crises.filter((crise) => crise.date === date),
          events: events.filter((event) => jourDe(event.at) === date),
        })),
      )
    }

    void load()
  }, [dogId])

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (days === null) return <Spinner />

  if (days.length === 0) {
    return (
      <div className="p-4">
        <Card>
          <p className="text-sm text-slate-500">
            Rien à afficher pour l’instant. L’historique se remplit au fil des saisies quotidiennes.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {days.map((day) => (
        <Card
          key={day.date}
          className={day.crises.length > 0 ? 'ring-2 ring-red-300' : ''}
        >
          <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
            {formatLongDate(day.date)}
          </p>

          {day.crises.map((crise) => (
            <div key={crise.id} className="mt-2 rounded-xl bg-red-50 px-3 py-2">
              <p className="text-sm font-bold text-red-800">Crise signalée</p>
              {crise.changements.length > 0 && (
                <p className="mt-0.5 text-xs text-red-700">
                  {crise.changements
                    .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                    .join(' · ')}
                </p>
              )}
              {crise.note && <p className="mt-1 text-sm text-red-900">{crise.note}</p>}
            </div>
          ))}

          {day.events.length > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              {[...day.events]
                .reverse()
                .map((e) => `${e.nom}${e.intensite !== null ? ` ${e.intensite}` : ''}`)
                .join(' · ')}
            </p>
          )}

          {day.entry ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {day.entry.score_fecal !== null && (
                  <span className="rounded-lg bg-brand-100 px-2 py-1 font-semibold text-brand-800">
                    Score fécal {day.entry.score_fecal}
                  </span>
                )}
                {day.entry.vomissements_count > 0 && (
                  <span className="rounded-lg bg-amber-100 px-2 py-1 font-medium text-amber-800">
                    {day.entry.vomissements_count} vomissement
                    {day.entry.vomissements_count > 1 ? 's' : ''}
                  </span>
                )}
                {day.entry.appetit && (
                  <span className="text-slate-600">
                    Appétit&nbsp;
                    {APPETIT_OPTIONS.find((o) => o.value === day.entry!.appetit)?.label.toLowerCase()}
                  </span>
                )}
                {day.entry.energie && (
                  <span className="text-slate-600">
                    Énergie&nbsp;
                    {ENERGIE_OPTIONS.find((o) => o.value === day.entry!.energie)?.label.toLowerCase()}
                  </span>
                )}
              </div>

              {day.entry.symptoms.length > 0 && (
                <p className="mt-2 text-sm text-slate-700">
                  {day.entry.symptoms
                    .map(
                      (symptom) =>
                        `${symptom.nom} (${GRAVITE_OPTIONS.find(
                          (g) => g.value === symptom.gravite,
                        )?.label.toLowerCase()})`,
                    )
                    .join(', ')}
                </p>
              )}

              {day.entry.notes && (
                <p className="mt-2 text-sm text-slate-500 italic">{day.entry.notes}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Pas de saisie quotidienne ce jour-là.</p>
          )}
        </Card>
      ))}
    </div>
  )
}
