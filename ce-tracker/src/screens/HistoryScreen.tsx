import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, SuiviEvent, Weight } from '../lib/types'
import { todayISO } from '../lib/date'
import { type Categorie, construireJours } from '../lib/journal'
import { stoolPhotoUrl } from '../lib/storage'
import { Card, ErrorMessage, Sheet, Spinner, inputClass } from '../components/ui'
import JourCard from '../components/JourCard'
import CrisisSheet from './CrisisSheet'

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

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
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
  const [editingCrise, setEditingCrise] = useState<Crise | null>(null)
  const [refreshSignal, setRefreshSignal] = useState(0)

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
  }, [dogId, periodeJours, debut, fin, refreshSignal])

  const repasEvents = useMemo(() => events.filter((e) => e.type === 'repas'), [events])

  const jours = useMemo(
    () => construireJours(entries ?? [], crises, events, poids, debut, fin),
    [entries, crises, events, poids, debut, fin],
  )

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
              onEditCrise={setEditingCrise}
            />
          ))}
        </div>
      )}

      {zoomed?.storage_path && (
        <Sheet title={zoomed.nom} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
        </Sheet>
      )}

      {editingCrise && (
        <CrisisSheet
          dogId={dogId}
          crise={editingCrise}
          onClose={() => setEditingCrise(null)}
          onSaved={() => {
            setEditingCrise(null)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
