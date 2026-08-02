import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SuiviEvent } from '../lib/types'
import { resumeDetailsEvenement } from '../data/catalogs'
import { formatLongDate, heureDe, todayISO } from '../lib/date'
import { jourDe } from '../lib/journal'
import { stoolPhotoUrl } from '../lib/storage'
import { Card, ErrorMessage, Sheet, Spinner } from '../components/ui'

type Props = { dogId: string }

const PERIODES: { jours: number | null; label: string }[] = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
  { jours: null, label: 'Tout' },
]

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Toutes les photos de selle, en grille, pour repasser en revue visuellement
 * une période plutôt que de rouvrir chaque entrée une à une. */
export default function PhotosScreen({ dogId }: Props) {
  const [periodeJours, setPeriodeJours] = useState<number | null>(90)
  const [photos, setPhotos] = useState<SuiviEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)

  useEffect(() => {
    setPhotos(null)
    async function load() {
      let requete = supabase
        .from('events')
        .select('*')
        .eq('dog_id', dogId)
        .eq('type', 'selle')
        .not('storage_path', 'is', null)
        .order('at', { ascending: false })
        .limit(2000)

      if (periodeJours !== null) {
        const debut = reculerDe(todayISO(), periodeJours - 1)
        requete = requete.gte('at', new Date(`${debut}T00:00:00`).toISOString())
      }

      const { data, error: dbError } = await requete
      if (dbError) setError(dbError.message)
      else setPhotos(data as SuiviEvent[])
    }
    void load()
  }, [dogId, periodeJours])

  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-2 overflow-x-auto">
        {PERIODES.map((periode) => (
          <button
            key={periode.label}
            type="button"
            aria-pressed={periodeJours === periode.jours}
            onClick={() => setPeriodeJours(periode.jours)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              periodeJours === periode.jours
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {periode.label}
          </button>
        ))}
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {photos === null ? (
        <Spinner />
      ) : photos.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Aucune photo de selle sur cette période.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {photos.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setZoomed(event)}
              className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-slate-200"
            >
              <img src={stoolPhotoUrl(event.storage_path!)} alt="" className="h-full w-full object-cover" />
              {event.intensite !== null && (
                <span className="absolute right-1 bottom-1 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {event.intensite}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {zoomed?.storage_path && (
        <Sheet title={formatLongDate(jourDe(zoomed.at))} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-slate-500">
              {heureDe(zoomed.at)}
              {zoomed.intensite !== null && ` · Score fécal ${zoomed.intensite}/7`}
            </p>
            {resumeDetailsEvenement('selle', zoomed.details) && (
              <p className="text-slate-700">{resumeDetailsEvenement('selle', zoomed.details)}</p>
            )}
            {zoomed.note && <p className="text-slate-600 italic">{zoomed.note}</p>}
          </div>
        </Sheet>
      )}
    </div>
  )
}
