import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Dog, Raccourci, SuiviEvent } from '../lib/types'
import { CATALOGUE_SYMPTOMES, COTATIONS, TOUS_LES_SYMPTOMES } from '../data/symptomes'
import { FECAL_SCORES } from '../data/catalogs'
import { Button, Card, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

/** Heure d'un horodatage, en local, sans les secondes. */
function heure(at: string): string {
  return new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Horodatage à enregistrer : la date affichée, à l'heure qu'il est. */
function horodatage(date: string, hhmm?: string): string {
  const [h, m] = (hhmm ?? new Date().toTimeString().slice(0, 5)).split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

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

type Props = {
  dog: Dog
  date: string
  onDogChange: (dog: Dog) => void
}

export default function JournalSection({ dog, date, onDogChange }: Props) {
  const [events, setEvents] = useState<SuiviEvent[] | null>(null)
  const [ajout, setAjout] = useState<Raccourci | 'catalogue' | null>(null)
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
  }, [dog.id, date])

  useEffect(() => {
    void load()
  }, [load])

  async function enregistrer(entree: Raccourci, intensite: number | null, hhmm?: string) {
    const { error: dbError } = await supabase.from('events').insert({
      dog_id: dog.id,
      at: horodatage(date, hhmm),
      type: entree.type,
      nom: entree.nom,
      categorie: entree.categorie,
      intensite,
    })
    if (dbError) setError(dbError.message)
    else void load()
  }

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('events').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else void load()
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
                onClick={() => (r.echelle ? setAjout(r) : void enregistrer(r, null))}
                className="relative rounded-2xl bg-white px-3 py-5 text-center shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-brand-50"
              >
                <span className="block text-sm font-semibold text-slate-900">{r.nom}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {r.echelle ? 'appui puis intensité' : 'un appui'}
                </span>
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
                <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{event.nom}</span>
                    <span className="block text-xs text-slate-500">
                      {event.categorie ?? (event.type === 'selle' ? 'Selle' : 'Repas')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-500">
                    {heure(event.at)}
                  </span>
                  {event.intensite !== null && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {event.intensite}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Supprimer ${event.nom} de ${heure(event.at)}`}
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
          onClick={() => setAjout('catalogue')}
        >
          Ajouter une entrée
        </Button>
      </div>

      {ajout && (
        <AjoutSheet
          depart={ajout === 'catalogue' ? null : ajout}
          onClose={() => setAjout(null)}
          onAdd={(entree, intensite, hhmm) => {
            setAjout(null)
            void enregistrer(entree, intensite, hhmm)
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

/** Choix de l'entrée, puis de son intensité et de son heure. */
function AjoutSheet({
  depart,
  onClose,
  onAdd,
}: {
  depart: Raccourci | null
  onClose: () => void
  onAdd: (entree: Raccourci, intensite: number | null, hhmm: string) => void
}) {
  const [choisi, setChoisi] = useState<Raccourci | null>(depart)
  const [intensite, setIntensite] = useState<number | null>(null)
  const [hhmm, setHhmm] = useState(new Date().toTimeString().slice(0, 5))

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

        <Field label="Heure">
          <input
            type="time"
            value={hhmm}
            onChange={(e) => setHhmm(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Button
          type="button"
          className="w-full"
          disabled={choisi.echelle && intensite === null}
          onClick={() => onAdd(choisi, choisi.echelle ? intensite : null, hhmm)}
        >
          Enregistrer
        </Button>
        {!depart && (
          <Button
            type="button"
            variant="ghost"
            className="w-full py-2.5 text-sm"
            onClick={() => {
              setChoisi(null)
              setIntensite(null)
            }}
          >
            Retour à la liste
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
