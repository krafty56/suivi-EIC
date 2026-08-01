import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Dog, Raccourci, SuiviEvent } from '../lib/types'
import { CATALOGUE_SYMPTOMES, COTATIONS, TOUS_LES_SYMPTOMES } from '../data/symptomes'
import { FECAL_SCORES } from '../data/catalogs'
import { LABEL_TYPE_EVENEMENT } from '../data/events'
import { datetimeLocalDe, heureDe, horodatage, isoDeDatetimeLocal } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

/** Repas et selles ne viennent pas du catalogue de symptômes. */
const ENTREES_HORS_CATALOGUE: Raccourci[] = [
  { type: 'selle', nom: 'Selle', categorie: null, echelle: true },
  { type: 'repas', nom: 'Repas', categorie: null, echelle: false },
]

const CHOIX_POSSIBLES: Raccourci[] = [
  ...ENTREES_HORS_CATALOGUE,
  ...TOUS_LES_SYMPTOMES.map((s) => ({
    type: 'symptome' as const,
    nom: s.nom,
    categorie: s.categorie,
    echelle: s.echelle,
  })),
]

type Ajout =
  | { mode: 'nouveau'; depart: Raccourci | null }
  | { mode: 'edition'; evenement: SuiviEvent }

type Props = {
  dog: Dog
  date: string
  onDogChange: (dog: Dog) => void
  /** Change de valeur pour forcer un rechargement, quand un événement a été
   * ajouté ailleurs (traitement, note libre, activité). */
  refreshSignal?: number
  /** Un événement de la liste dont le type n'est pas symptôme/selle/repas :
   * son édition est déléguée à la feuille qui sait le traiter. */
  onEditAutre?: (evenement: SuiviEvent) => void
}

export default function JournalSection({
  dog,
  date,
  onDogChange,
  refreshSignal,
  onEditAutre,
}: Props) {
  const [events, setEvents] = useState<SuiviEvent[] | null>(null)
  const [ajout, setAjout] = useState<Ajout | null>(null)
  const [config, setConfig] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const debut = new Date(`${date}T00:00:00`)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 1)

    const { data, error: dbError } = await supabase
      .from('events')
      .select('*')
      .eq('dog_id', dog.id)
      .gte('at', debut.toISOString())
      .lt('at', fin.toISOString())
      .order('at', { ascending: false })

    if (dbError) setError(dbError.message)
    else setEvents(data as SuiviEvent[])
  }, [dog.id, date, refreshSignal])

  useEffect(() => {
    void load()
  }, [load])

  async function sauvegarder(payload: {
    id?: string
    entree: Raccourci
    intensite: number | null
    quand: string
    note: string
  }) {
    const valeurs = {
      dog_id: dog.id,
      at: isoDeDatetimeLocal(payload.quand),
      type: payload.entree.type,
      nom: payload.entree.nom,
      categorie: payload.entree.categorie,
      intensite: payload.intensite,
      note: payload.note.trim() || null,
    }
    const { error: dbError } = payload.id
      ? await supabase.from('events').update(valeurs).eq('id', payload.id)
      : await supabase.from('events').insert(valeurs)
    if (dbError) setError(dbError.message)
    else void load()
  }

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('events').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  function ouvrirEdition(event: SuiviEvent) {
    if (event.type === 'symptome' || event.type === 'selle' || event.type === 'repas') {
      setAjout({ mode: 'edition', evenement: event })
    } else {
      onEditAutre?.(event)
    }
  }

  const raccourcis = dog.saisie_rapide ?? []
  const compte = (r: Raccourci) =>
    (events ?? []).filter((e) => e.type === r.type && e.nom === r.nom).length

  return (
    <>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Saisie rapide
          </p>
          <button
            type="button"
            onClick={() => setConfig(true)}
            className="text-xs font-medium text-brand-700 underline"
          >
            Modifier
          </button>
        </div>

        {raccourcis.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              Choisissez deux entrées fréquentes pour les enregistrer d’un geste.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {raccourcis.map((r) => (
              <button
                key={`${r.type}-${r.nom}`}
                type="button"
                onClick={() => setAjout({ mode: 'nouveau', depart: r })}
                className="relative rounded-2xl bg-white px-3 py-5 text-center shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-brand-50"
              >
                <span className="block text-sm font-semibold text-slate-900">{r.nom}</span>
                <span className="mt-0.5 block text-xs text-slate-500">Appui puis validation</span>
                {compte(r) > 0 && (
                  <span className="absolute top-2 right-2 min-w-6 rounded-full bg-brand-50 px-1.5 py-0.5 text-xs font-bold tabular-nums text-slate-900">
                    {compte(r)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Entrées du jour
        </p>

        <ErrorMessage>{error}</ErrorMessage>

        <Card className="p-0">
          {events === null ? (
            <p className="p-4 text-sm text-slate-500">Chargement…</p>
          ) : events.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucune entrée pour cette journée.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => ouvrirEdition(event)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{event.nom}</span>
                      <span className="block text-xs text-slate-500">
                        {event.categorie ?? LABEL_TYPE_EVENEMENT[event.type]}
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
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${event.nom} de ${heureDe(event.at)}`}
                    onClick={() => void supprimer(event.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full py-2.5 text-sm"
          onClick={() => setAjout({ mode: 'nouveau', depart: null })}
        >
          Ajouter une entrée
        </Button>
      </div>

      {ajout && (
        <AjoutSheet
          key={ajout.mode === 'edition' ? ajout.evenement.id : 'nouveau'}
          init={ajout}
          date={date}
          onClose={() => setAjout(null)}
          onSave={(payload) => {
            setAjout(null)
            void sauvegarder(payload)
          }}
        />
      )}

      {config && (
        <ConfigSheet
          dog={dog}
          onClose={() => setConfig(false)}
          onSaved={(d) => {
            setConfig(false)
            onDogChange(d)
          }}
        />
      )}
    </>
  )
}

/** Choix de l'entrée, puis de sa date, son heure, son intensité et une note.
 * Sert aussi bien à ajouter qu'à corriger une entrée déjà enregistrée. */
function AjoutSheet({
  init,
  date,
  onClose,
  onSave,
}: {
  init: Ajout
  date: string
  onClose: () => void
  onSave: (payload: {
    id?: string
    entree: Raccourci
    intensite: number | null
    quand: string
    note: string
  }) => void
}) {
  const evenement = init.mode === 'edition' ? init.evenement : null
  const depart = init.mode === 'nouveau' ? init.depart : null
  const maintenant = datetimeLocalDe(new Date().toISOString())

  const [choisi, setChoisi] = useState<Raccourci | null>(
    evenement
      ? {
          type: evenement.type as 'symptome' | 'selle' | 'repas',
          nom: evenement.nom,
          categorie: evenement.categorie,
          echelle: evenement.intensite !== null,
        }
      : depart,
  )
  const [intensite, setIntensite] = useState<number | null>(evenement?.intensite ?? null)
  const [quand, setQuand] = useState(
    evenement ? datetimeLocalDe(evenement.at) : datetimeLocalDe(horodatage(date)),
  )
  const [note, setNote] = useState(evenement?.note ?? '')

  if (!choisi) {
    return (
      <Sheet title="Ajouter une entrée" onClose={onClose}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Autres entrées
            </p>
            <div className="space-y-1.5">
              {ENTREES_HORS_CATALOGUE.map((e) => (
                <Ligne key={e.nom} nom={e.nom} onClick={() => setChoisi(e)} />
              ))}
            </div>
          </div>
          {CATALOGUE_SYMPTOMES.map((groupe) => (
            <div key={groupe.categorie}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {groupe.categorie}
              </p>
              <div className="space-y-1.5">
                {groupe.symptomes.map((s) => (
                  <Ligne
                    key={s.nom}
                    nom={s.nom}
                    onClick={() =>
                      setChoisi({
                        type: 'symptome',
                        nom: s.nom,
                        categorie: groupe.categorie,
                        echelle: s.echelle,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    )
  }

  const purina = choisi.type === 'selle'

  return (
    <Sheet title={choisi.nom} onClose={onClose}>
      <div className="space-y-5">
        {choisi.echelle && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {purina ? 'Score fécal' : 'Intensité'}
            </p>
            <div className={`grid gap-1.5 ${purina ? 'grid-cols-7' : 'grid-cols-3'}`}>
              {(purina ? FECAL_SCORES.map((f) => f.score) : COTATIONS.map((c) => c.valeur)).map(
                (v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={intensite === v}
                    onClick={() => setIntensite(v)}
                    className={`rounded-xl py-3 text-sm font-bold tabular-nums transition-colors ${
                      intensite === v
                        ? 'bg-brand-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {v}
                  </button>
                ),
              )}
            </div>
            <p className="mt-2 min-h-9 text-sm text-slate-600">
              {intensite === null
                ? 'Aucune valeur sélectionnée.'
                : purina
                  ? FECAL_SCORES.find((f) => f.score === intensite)?.description
                  : COTATIONS.find((c) => c.valeur === intensite)?.label}
            </p>
          </div>
        )}

        <Field label="Quand ?">
          <input
            type="datetime-local"
            value={quand}
            max={maintenant}
            onChange={(e) => setQuand(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Notes (optionnel)">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Button
          type="button"
          className="w-full"
          disabled={choisi.echelle && intensite === null}
          onClick={() =>
            onSave({
              id: evenement?.id,
              entree: choisi,
              intensite: choisi.echelle ? intensite : null,
              quand,
              note,
            })
          }
        >
          {evenement ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
        {(evenement !== null || depart === null) && (
          <Button
            type="button"
            variant="ghost"
            className="w-full py-2.5 text-sm"
            onClick={() => {
              setChoisi(null)
              setIntensite(null)
            }}
          >
            Changer
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function Ligne({ nom, onClick }: { nom: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-slate-50 px-3 py-3 text-left text-sm text-slate-800 hover:bg-slate-100"
    >
      {nom}
    </button>
  )
}

/** Choix des deux raccourcis de l'écran d'accueil. */
function ConfigSheet({
  dog,
  onClose,
  onSaved,
}: {
  dog: Dog
  onClose: () => void
  onSaved: (dog: Dog) => void
}) {
  const [choix, setChoix] = useState<Raccourci[]>(dog.saisie_rapide ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const estChoisi = (r: Raccourci) => choix.some((c) => c.type === r.type && c.nom === r.nom)

  function basculer(r: Raccourci) {
    setChoix((current) => {
      if (estChoisi(r)) return current.filter((c) => !(c.type === r.type && c.nom === r.nom))
      // Deux raccourcis au maximum : le plus ancien cède la place.
      return [...current, r].slice(-2)
    })
  }

  async function enregistrer() {
    setBusy(true)
    const { data, error: dbError } = await supabase
      .from('dogs')
      .update({ saisie_rapide: choix })
      .eq('id', dog.id)
      .select()
      .single()

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved(data as Dog)
  }

  return (
    <Sheet title="Saisie rapide" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">
        Deux entrées au maximum. En choisir une troisième remplace la plus ancienne.
      </p>

      <div className="space-y-1.5">
        {CHOIX_POSSIBLES.map((r) => (
          <label
            key={`${r.type}-${r.nom}`}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors ${
              estChoisi(r) ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200'
            }`}
          >
            <input
              type="checkbox"
              checked={estChoisi(r)}
              onChange={() => basculer(r)}
              className="h-4 w-4 shrink-0 accent-brand-700"
            />
            <span className="flex-1 text-sm text-slate-800">{r.nom}</span>
            {r.categorie && <span className="text-xs text-slate-500">{r.categorie}</span>}
          </label>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      <Button type="button" disabled={busy} className="mt-4 w-full" onClick={() => void enregistrer()}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </Sheet>
  )
}
