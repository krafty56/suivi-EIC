import { useEffect, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import type { Dog, SuiviEvent } from '../lib/types'
import { resumeDetailsEvenement } from '../data/catalogs'
import { formatLongDate, formatShortDate, heureDe, todayISO } from '../lib/date'
import { jourDe } from '../lib/journal'
import { usePremium } from '../lib/premium'
import { stoolPhotoUrl } from '../lib/storage'
import PhotosPdf, { type PhotoPdfItem } from '../lib/pdf/PhotosPdf'
import { redimensionnerPourPdf } from '../lib/pdf/prepareImage'
import { Button, Card, ErrorMessage, Sheet, Spinner } from '../components/ui'
import { Verrou } from '../components/Verrou'

type Props = { dog: Dog }

const PERIODES: { jours: number | null; label: string }[] = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
  { jours: null, label: 'Tout' },
]

const LIMITE_GRATUITE = 20

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Toutes les photos de selle, en grille, pour repasser en revue visuellement
 * une période plutôt que de rouvrir chaque entrée une à une. */
export default function PhotosScreen({ dog }: Props) {
  const { isPremium } = usePremium()
  const [periodeJours, setPeriodeJours] = useState<number | null>(90)
  const [photos, setPhotos] = useState<SuiviEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)
  const [genereBusy, setGenereBusy] = useState(false)

  useEffect(() => {
    setPhotos(null)
    async function load() {
      let requete = supabase
        .from('events')
        .select('*')
        .eq('dog_id', dog.id)
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
  }, [dog.id, periodeJours])

  const photosVisibles = photos !== null ? (isPremium ? photos : photos.slice(0, LIMITE_GRATUITE)) : []

  /** Génère un PDF de la galerie (dates + score fécal) — les images sont
   * redimensionnées côté client avant d'être intégrées, sans quoi une
   * centaine de photos à pleine résolution rendrait l'export interminable. */
  async function telechargerPdf() {
    setError(null)
    setGenereBusy(true)
    try {
      const items: PhotoPdfItem[] = await Promise.all(
        photosVisibles.map(async (event) => ({
          id: event.id,
          dataUrl: await redimensionnerPourPdf(stoolPhotoUrl(event.storage_path!)),
          date: formatShortDate(jourDe(event.at)),
          score: event.intensite,
        })),
      )
      const periodeLabel = periodeJours === null ? 'Toutes les photos' : `${periodeJours} derniers jours`
      const blob = await pdf(
        <PhotosPdf dogName={dog.name} periodeLabel={periodeLabel} photos={items} genereLe={formatShortDate(todayISO())} />,
      ).toBlob()
      const nomFichier = `${dog.name.replace(/[^a-zA-Z0-9-]+/g, '-')}-photos-selles.pdf`
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = nomFichier
      lien.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('La génération du PDF a échoué. Réessaie.')
    } finally {
      setGenereBusy(false)
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
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
        {isPremium && photosVisibles.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 py-2 text-xs"
            disabled={genereBusy}
            onClick={() => void telechargerPdf()}
          >
            {genereBusy ? 'Génération…' : 'PDF'}
          </Button>
        )}
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {photos === null ? (
        <Spinner />
      ) : photos.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Aucune photo de selle sur cette période.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1">
            {photosVisibles.map((event) => (
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
          {!isPremium && photos.length > LIMITE_GRATUITE && (
            <Verrou
              titre="Galerie complète"
              description={`Les ${LIMITE_GRATUITE} photos les plus récentes sont affichées. ${
                photos.length - LIMITE_GRATUITE
              } photo(s) plus ancienne(s) réservée(s) au premium.`}
            />
          )}
        </>
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
