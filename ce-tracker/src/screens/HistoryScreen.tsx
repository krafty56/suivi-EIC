import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, SuiviEvent, Weight } from '../lib/types'
import { CHANGEMENT_OPTIONS } from '../data/catalogs'
import { EMOJI_CRISE } from '../data/emoji'
import { formatLongDate, todayISO } from '../lib/date'
import {
  type Categorie,
  type Gravite,
  type LigneJour,
  graviteJour,
  jourDe,
  lignesJour,
  resumeJour,
  texteLigne,
} from '../lib/journal'
import { stoolPhotoUrl } from '../lib/storage'
import { Card, ErrorMessage, Sheet, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

const PERIODES = [
  { jours: 7, label: '7 j' },
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
]

const CATEGORIES: { id: Categorie; label: string }[] = [
  { id: 'symptome', label: 'Symptôme' },
  { id: 'selle', label: 'Selle' },
  { id: 'repas', label: 'Repas' },
  { id: 'activite', label: 'Activité' },
  { id: 'traitement', label: 'Traitement' },
  { id: 'poids', label: 'Poids' },
  { id: 'note', label: 'Note' },
]

const BARRE_GRAVITE: Record<Gravite, string> = {
  rouge: 'bg-red-700',
  orange: 'bg-amber-800',
  verte: 'bg-brand-200',
  neutre: 'bg-slate-200',
}

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

function correspond(texte: string, recherche: string): boolean {
  return recherche.trim() === '' || texte.toLowerCase().includes(recherche.trim().toLowerCase())
}

type Jour = {
  date: string
  crises: Crise[]
  lignes: LigneJour[]
  resume: ReturnType<typeof resumeJour>
  gravite: Gravite
}

export default function HistoryScreen({ dogId }: Props) {
  const [periodeJours, setPeriodeJours] = useState(30)
  const [recherche, setRecherche] = useState('')
  const [categoriesActives, setCategoriesActives] = useState<Set<Categorie>>(new Set())

  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [crises, setCrises] = useState<Crise[]>([])
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [poids, setPoids] = useState<Weight[]>([])
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)

  const fin = todayISO()
  const debut = reculerDe(fin, periodeJours - 1)

  useEffect(() => {
    setEntries(null)
    // Un jour de recul supplémentaire pour les événements, afin de retrouver
    // le dernier repas d'un symptôme survenu tôt le premier jour affiché.
    const debutEvenements = reculerDe(debut, 1)
    const debutTs = new Date(`${debutEvenements}T00:00:00`).toISOString()
    const finExclusive = new Date(`${fin}T00:00:00`)
    finExclusive.setDate(finExclusive.getDate() + 1)
    const finTs = finExclusive.toISOString()

    async function load() {
      const [e, c, ev, p] = await Promise.all([
        supabase
          .from('daily_entries')
          .select('*')
          .eq('dog_id', dogId)
          .gte('date', debut)
          .lte('date', fin)
          .order('date'),
        supabase.from('crises').select('*').eq('dog_id', dogId).gte('date', debut).lte('date', fin).order('date'),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dogId)
          .gte('at', debutTs)
          .lt('at', finTs)
          .order('at')
          .limit(5000),
        supabase.from('weights').select('*').eq('dog_id', dogId).gte('date', debut).lte('date', fin).order('date'),
      ])
      const dbError = e.error ?? c.error ?? ev.error ?? p.error
      if (dbError) {
        setError(dbError.message)
        return
      }
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
      setEvents(ev.data as SuiviEvent[])
      setPoids(p.data as Weight[])
    }
    void load()
  }, [dogId, periodeJours, debut, fin])

  const repasEvents = useMemo(() => events.filter((e) => e.type === 'repas'), [events])

  const jours = useMemo<Jour[]>(() => {
    const entriesData = entries ?? []
    const dates = new Set<string>([
      ...entriesData.map((e) => e.date),
      ...crises.map((c) => c.date),
      ...events.filter((e) => jourDe(e.at) >= debut).map((e) => jourDe(e.at)),
      ...poids.map((p) => p.date),
    ])
    return [...dates]
      .filter((date) => date >= debut && date <= fin)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const evenementsJour = events.filter((e) => jourDe(e.at) === date)
        const poidsJour = poids.filter((p) => p.date === date)
        const crisesJour = crises.filter((c) => c.date === date)
        const entryJour = entriesData.find((e) => e.date === date) ?? null
        return {
          date,
          crises: crisesJour,
          lignes: lignesJour(evenementsJour, poidsJour),
          resume: resumeJour(evenementsJour, entryJour, crisesJour),
          gravite: graviteJour(evenementsJour, entryJour, crisesJour),
        }
      })
  }, [entries, crises, events, poids, debut, fin])

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('events').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  async function supprimerPoids(id: string) {
    const { error: dbError } = await supabase.from('weights').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else setPoids((prev) => prev.filter((p) => p.id !== id))
  }

  function basculerCategorie(id: Categorie) {
    setCategoriesActives((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>

  return (
    <div>
      <div className="space-y-3 p-4 pb-2">
        <input
          type="search"
          placeholder="Rechercher…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className={inputClass}
        />

        <div className="flex gap-2 overflow-x-auto">
          {PERIODES.map((periode) => (
            <button
              key={periode.jours}
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

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = categoriesActives.has(cat.id)
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={active}
                onClick={() => basculerCategorie(cat.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {entries === null ? (
        <Spinner />
      ) : jours.length === 0 ? (
        <div className="p-4">
          <Card>
            <p className="text-sm text-slate-500">
              Rien à afficher pour l’instant. L’historique se remplit au fil des saisies quotidiennes.
            </p>
          </Card>
        </div>
      ) : (
        <div className="space-y-3 p-4 pt-1">
          {jours.map((jour) => (
            <JourCard
              key={jour.date}
              jour={jour}
              recherche={recherche}
              categoriesActives={categoriesActives}
              repas={repasEvents}
              onDelete={supprimer}
              onDeletePoids={supprimerPoids}
              onZoom={setZoomed}
            />
          ))}
        </div>
      )}

      {zoomed?.storage_path && (
        <Sheet title={zoomed.nom} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
        </Sheet>
      )}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'slate' | 'brand' | 'amber'; children: React.ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-100 text-brand-800',
    amber: 'bg-amber-100 text-amber-800',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tones[tone]}`}>
      {children}
    </span>
  )
}

function JourCard({
  jour,
  recherche,
  categoriesActives,
  repas,
  onDelete,
  onDeletePoids,
  onZoom,
}: {
  jour: Jour
  recherche: string
  categoriesActives: Set<Categorie>
  repas: SuiviEvent[]
  onDelete: (id: string) => Promise<void>
  onDeletePoids: (id: string) => Promise<void>
  onZoom: (event: SuiviEvent) => void
}) {
  const lignesFiltrees = jour.lignes.filter((ligne) => {
    if (categoriesActives.size > 0 && !categoriesActives.has(ligne.categorie)) return false
    if (recherche.trim() === '') return true
    const texte = texteLigne(ligne, repas)
    return (
      correspond(texte.titre, recherche) ||
      correspond(texte.sousTitre ?? '', recherche) ||
      (ligne.kind === 'event' && correspond(ligne.event.note ?? '', recherche))
    )
  })

  const crisesFiltrees = jour.crises.filter(
    (crise) =>
      recherche.trim() === '' ||
      correspond(crise.note ?? '', recherche) ||
      crise.changements.some((c) => correspond(CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c, recherche)),
  )

  if (lignesFiltrees.length === 0 && crisesFiltrees.length === 0) return null

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex">
        <span className={`w-1.5 shrink-0 ${BARRE_GRAVITE[jour.gravite]}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
              {formatLongDate(jour.date)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {jour.resume.reflux > 0 && <Badge tone="slate">{jour.resume.reflux} reflux</Badge>}
              {jour.resume.selleScore !== null && <Badge tone="brand">selle {jour.resume.selleScore}/7</Badge>}
              {jour.resume.vomissements > 0 && (
                <Badge tone="amber">
                  {jour.resume.vomissements} vomissement{jour.resume.vomissements > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {crisesFiltrees.map((crise) => (
            <div key={crise.id} className="mb-1.5 rounded-xl bg-red-50 px-3 py-2">
              <p className="text-sm font-bold text-red-800">
                {EMOJI_CRISE} Crise signalée
                {crise.changements.length > 0 &&
                  ` — ${crise.changements
                    .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                    .join(', ')}`}
              </p>
              {crise.note && <p className="mt-0.5 text-sm text-red-900">{crise.note}</p>}
            </div>
          ))}

          {lignesFiltrees.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {lignesFiltrees.map((ligne) => {
                const texte = texteLigne(ligne, repas)
                return (
                  <li key={ligne.id} className="flex items-center gap-2 py-2">
                    <span className="shrink-0 text-lg" aria-hidden="true">
                      {texte.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{texte.titre}</span>
                      {texte.sousTitre && (
                        <span className="block truncate text-xs text-slate-500">{texte.sousTitre}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{texte.heure}</span>
                    <span className="w-8 shrink-0">
                      {ligne.kind === 'event' && ligne.event.type === 'selle' && ligne.event.storage_path && (
                        <button type="button" onClick={() => onZoom(ligne.event)}>
                          <img
                            src={stoolPhotoUrl(ligne.event.storage_path)}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200"
                          />
                        </button>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={ligne.kind === 'poids' ? 'Supprimer la pesée' : `Supprimer ${ligne.event.nom}`}
                      onClick={() => void (ligne.kind === 'poids' ? onDeletePoids(ligne.id) : onDelete(ligne.id))}
                      className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
                    >
                      &times;
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
