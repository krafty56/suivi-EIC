import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appetit, CustomEntry, Dog, QuantiteRepas, Raccourci, SuiviEvent } from '../lib/types'
import { CATALOGUE_SYMPTOMES, COTATIONS, COTATIONS_SPECIFIQUES, TOUS_LES_SYMPTOMES } from '../data/symptomes'
import {
  APPETIT_OPTIONS,
  COULEURS_SELLE,
  DETAILS_SELLE,
  FECAL_SCORES,
  QUANTITE_REPAS_OPTIONS,
  QUANTITE_TONE_CLASSES,
  TAILLES_SELLE,
  resumeDetailsEvenement,
} from '../data/catalogs'
import { LABEL_TYPE_EVENEMENT } from '../data/events'
import { emojiEvenement } from '../data/emoji'
import { datetimeLocalDe, heureDe, horodatage, isoDeDatetimeLocal } from '../lib/date'
import { usePremium } from '../lib/premium'
import { STOOL_BUCKET, stoolPhotoUrl } from '../lib/storage'
import { Button, Card, ErrorMessage, Field, Sheet, SegmentedControl, inputClass } from '../components/ui'
import { Verrou } from '../components/Verrou'

/** Redimensionne et recompresse la photo avant de l'envoyer à l'IA : une
 * photo de smartphone dépasse vite les 10 Mo par image acceptés par
 * l'API Anthropic, et une telle résolution n'apporte rien pour juger une
 * simple consistance de selle. Ne touche jamais le fichier original, qui
 * part tel quel dans le stockage à l'enregistrement de l'entrée. */
function redimensionnerPourAnalyse(fichier: File): Promise<{ base64: string; mediaType: string }> {
  const TAILLE_MAX_PX = 1568

  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(fichier)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, TAILLE_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * ratio)
      canvas.height = Math.round(image.naturalHeight * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Redimensionnement impossible.'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      // Qualité haute : à 1568 px, la marge jusqu'aux 10 Mo Anthropic est
      // large, et c'est justement la texture fine (mat/luisant, craquelé/
      // lisse) qui distingue les scores adjacents — pas là qu'économiser.
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      resolve({ base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Photo illisible.'))
    }
    image.src = url
  })
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

const CATEGORIE_PERSONNALISEE = 'Personnalisé'

/** Une entrée personnalisée se comporte comme un symptôme partout où elle
 * apparaît (choix, saisie rapide, journal) : seule sa provenance diffère. */
function entreeVersRaccourci(entree: CustomEntry): Raccourci {
  return {
    type: 'symptome',
    nom: entree.nom,
    categorie: CATEGORIE_PERSONNALISEE,
    echelle: entree.echelle,
    emoji: entree.emoji,
    personnalise: true,
  }
}

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
  const [zoomed, setZoomed] = useState<SuiviEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Propre à ce chien (donc à son propriétaire) : jamais partagée avec le
  // reste de l'app, à l'inverse du catalogue de symptômes prédéfini.
  const [entreesPerso, setEntreesPerso] = useState<CustomEntry[]>([])

  useEffect(() => {
    supabase
      .from('custom_entries')
      .select('*')
      .eq('dog_id', dog.id)
      .order('created_at', { ascending: true })
      .then(({ data, error: dbError }) => {
        if (dbError) setError(dbError.message)
        else setEntreesPerso(data as CustomEntry[])
      })
  }, [dog.id])

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
    storagePath: string | null
    details: Record<string, unknown>
  }) {
    const valeurs = {
      dog_id: dog.id,
      at: isoDeDatetimeLocal(payload.quand),
      type: payload.entree.type,
      nom: payload.entree.nom,
      categorie: payload.entree.categorie,
      intensite: payload.intensite,
      note: payload.note.trim() || null,
      storage_path: payload.storagePath,
      details: payload.details,
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
                <span className="block text-2xl">{r.emoji ?? emojiEvenement(r.type, r.nom)}</span>
                <span className="mt-1 block text-sm font-semibold text-slate-900">{r.nom}</span>
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

      <Button
        type="button"
        variant="secondary"
        className="w-full py-2.5 text-sm"
        onClick={() => setAjout({ mode: 'nouveau', depart: null })}
      >
        Ajouter une entrée
      </Button>

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
                  <span className="shrink-0 pl-1 text-xl" aria-hidden="true">
                    {typeof event.details.emoji === 'string'
                      ? event.details.emoji
                      : emojiEvenement(event.type, event.nom)}
                  </span>
                  <button
                    type="button"
                    onClick={() => ouvrirEdition(event)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{event.nom}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {event.categorie ?? LABEL_TYPE_EVENEMENT[event.type]}
                        {resumeDetailsEvenement(event.type, event.details) &&
                          ` · ${resumeDetailsEvenement(event.type, event.details)}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-500">
                      {heureDe(event.at)}
                    </span>
                    <span className="flex w-9 shrink-0 justify-center">
                      {event.intensite !== null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {event.intensite}
                        </span>
                      ) : (
                        event.type === 'repas' &&
                        (() => {
                          const q = QUANTITE_REPAS_OPTIONS.find((o) => o.value === event.details.quantite)
                          return q ? (
                            <span
                              className={`h-3 w-3 rounded-full ${QUANTITE_TONE_CLASSES[q.tone].dot}`}
                              title={q.label}
                              aria-label={q.label}
                            />
                          ) : null
                        })()
                      )}
                    </span>
                  </button>
                  <span className="w-8 shrink-0">
                    {event.type === 'selle' && event.storage_path && (
                      <button type="button" onClick={() => setZoomed(event)}>
                        <img
                          src={stoolPhotoUrl(event.storage_path)}
                          alt=""
                          className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      </button>
                    )}
                  </span>
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
      </div>

      {ajout && (
        <AjoutSheet
          key={ajout.mode === 'edition' ? ajout.evenement.id : 'nouveau'}
          init={ajout}
          date={date}
          dogId={dog.id}
          entreesPerso={entreesPerso}
          onEntreePersonnaliseeCreee={(e) => setEntreesPerso((prev) => [...prev, e])}
          onClose={() => setAjout(null)}
          onSave={(payload) => {
            setAjout(null)
            void sauvegarder(payload)
          }}
        />
      )}

      {zoomed && zoomed.storage_path && (
        <Sheet title={zoomed.nom} onClose={() => setZoomed(null)}>
          <img src={stoolPhotoUrl(zoomed.storage_path)} alt="" className="w-full rounded-xl" />
        </Sheet>
      )}

      {config && (
        <ConfigSheet
          dog={dog}
          entreesPerso={entreesPerso}
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
  dogId,
  entreesPerso,
  onEntreePersonnaliseeCreee,
  onClose,
  onSave,
}: {
  init: Ajout
  date: string
  dogId: string
  entreesPerso: CustomEntry[]
  onEntreePersonnaliseeCreee: (entree: CustomEntry) => void
  onClose: () => void
  onSave: (payload: {
    id?: string
    entree: Raccourci
    intensite: number | null
    quand: string
    note: string
    storagePath: string | null
    details: Record<string, unknown>
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

  // Sous-formulaire de création d'une entrée personnalisée, ouvert depuis le
  // choix "+ Entrée personnalisée" quand aucune entrée n'est encore choisie.
  const [creation, setCreation] = useState(false)
  const [nomPerso, setNomPerso] = useState('')
  const [emojiPerso, setEmojiPerso] = useState('')
  const [busyPerso, setBusyPerso] = useState(false)
  const [erreurPerso, setErreurPerso] = useState<string | null>(null)

  async function creerEntreePersonnalisee() {
    setBusyPerso(true)
    setErreurPerso(null)
    const { data, error: dbError } = await supabase
      .from('custom_entries')
      .insert({ dog_id: dogId, nom: nomPerso.trim(), emoji: emojiPerso.trim(), echelle: false })
      .select()
      .single()
    setBusyPerso(false)
    if (dbError) {
      setErreurPerso(dbError.message)
      return
    }
    const nouvelleEntree = data as CustomEntry
    onEntreePersonnaliseeCreee(nouvelleEntree)
    setCreation(false)
    setChoisi(entreeVersRaccourci(nouvelleEntree))
  }

  // Taille, couleur et signes ponctuels n'ont de sens que pour une selle ;
  // ils vivent dans events.details plutôt que dans des colonnes dédiées.
  const detailsInitiaux = (evenement?.details ?? {}) as Record<string, unknown>
  const [taille, setTaille] = useState<string | null>((detailsInitiaux.taille as string) ?? null)
  const [couleur, setCouleur] = useState<string | null>((detailsInitiaux.couleur as string) ?? null)
  const [signes, setSignes] = useState<Record<string, boolean>>(
    Object.fromEntries(DETAILS_SELLE.map((d) => [d.key, Boolean(detailsInitiaux[d.key])])),
  )

  // L'appétit et la quantité mangée n'ont de sens que pour un repas. Les
  // repas importés portent l'ancien barème numérique (1 à 3) de l'app
  // d'origine, pour l'appétit uniquement.
  const appetiteInitial = detailsInitiaux.appetite
  const [appetitRepas, setAppetitRepas] = useState<Appetit | null>(
    typeof appetiteInitial === 'number'
      ? (({ 1: 'faible', 2: 'normal', 3: 'bon' } as Record<number, Appetit>)[appetiteInitial] ?? null)
      : ((appetiteInitial as Appetit) ?? null),
  )
  const [quantiteRepas, setQuantiteRepas] = useState<QuantiteRepas | null>(
    (detailsInitiaux.quantite as QuantiteRepas) ?? null,
  )

  // La photo n'a de sens que pour une selle, pas pour un symptôme constaté
  // ou un repas.
  const [fichierPhoto, setFichierPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoSupprimee, setPhotoSupprimee] = useState(false)
  const [busyPhoto, setBusyPhoto] = useState(false)
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null)
  const photoActuelle = evenement?.storage_path ?? null

  // Suggestion de score fécal par l'IA (échelle de Purina), à partir de la
  // photo tout juste choisie — jamais enregistrée automatiquement, la valeur
  // sélectionnée reste modifiable comme n'importe quelle intensité saisie
  // à la main.
  const { isPremium } = usePremium()
  const [busyAnalyse, setBusyAnalyse] = useState(false)
  const [erreurAnalyse, setErreurAnalyse] = useState<string | null>(null)
  const [analyseIA, setAnalyseIA] = useState<{
    score: number | null
    confiance: string
    justification: string
  } | null>(null)
  const [verrouAnalyseOuvert, setVerrouAnalyseOuvert] = useState(false)

  useEffect(() => {
    if (!fichierPhoto) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(fichierPhoto)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [fichierPhoto])

  async function analyserPhoto() {
    if (!fichierPhoto) return
    if (!isPremium) {
      setVerrouAnalyseOuvert(true)
      return
    }
    setBusyAnalyse(true)
    setErreurAnalyse(null)
    setAnalyseIA(null)
    try {
      const { base64, mediaType } = await redimensionnerPourAnalyse(fichierPhoto)
      const { data, error: fnError } = await supabase.functions.invoke('extract-fecal-score', {
        body: { image: base64, mediaType },
      })
      if (fnError) throw fnError
      const resultat = data as { score: number | null; confiance: string; justification: string }
      setAnalyseIA(resultat)
      if (resultat.score !== null) setIntensite(resultat.score)
    } catch (err) {
      // supabase-js réduit toute réponse d'erreur de la fonction à un message
      // générique ("Edge Function returned a non-2xx status code") : le
      // vrai détail est le corps de la réponse, exposé via `context`.
      const contexte = (err as { context?: Response }).context
      const detail = contexte ? await contexte.text().catch(() => null) : null
      setErreurAnalyse(detail || (err instanceof Error ? err.message : 'Analyse impossible.'))
    }
    setBusyAnalyse(false)
  }

  async function handleEnregistrer() {
    if (!choisi) return
    setErreurPhoto(null)

    let storagePath = choisi.type === 'selle' ? photoActuelle : null

    if (choisi.type === 'selle' && fichierPhoto) {
      setBusyPhoto(true)
      const extension = fichierPhoto.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${dogId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from(STOOL_BUCKET)
        .upload(path, fichierPhoto, { contentType: fichierPhoto.type || undefined })
      setBusyPhoto(false)
      if (uploadError) {
        setErreurPhoto(uploadError.message)
        return
      }
      storagePath = path
    } else if (choisi.type === 'selle' && photoSupprimee) {
      storagePath = null
    }

    const details =
      choisi.type === 'selle'
        ? {
            ...(taille ? { taille } : {}),
            ...(couleur ? { couleur } : {}),
            ...Object.fromEntries(Object.entries(signes).filter(([, v]) => v)),
          }
        : choisi.type === 'repas'
          ? {
              ...(appetitRepas ? { appetite: appetitRepas } : {}),
              ...(quantiteRepas ? { quantite: quantiteRepas } : {}),
            }
          : { ...(evenement?.details ?? {}), ...(choisi.emoji ? { emoji: choisi.emoji } : {}) }

    onSave({
      id: evenement?.id,
      entree: choisi,
      intensite: choisi.echelle ? intensite : null,
      quand,
      note,
      storagePath,
      details,
    })
  }

  if (!choisi) {
    if (creation) {
      return (
        <Sheet title="⭐ Entrée personnalisée" onClose={() => setCreation(false)}>
          <div className="space-y-5">
            <Field label="Nom">
              <input
                type="text"
                value={nomPerso}
                onChange={(e) => setNomPerso(e.target.value)}
                placeholder="Ex. Toux"
                className={inputClass}
              />
            </Field>
            <Field label="Émoji">
              <input
                type="text"
                value={emojiPerso}
                onChange={(e) => setEmojiPerso(e.target.value)}
                placeholder="Ex. 🤧"
                maxLength={4}
                className={inputClass}
              />
            </Field>
            <ErrorMessage>{erreurPerso}</ErrorMessage>
            <Button
              type="button"
              className="w-full"
              disabled={!nomPerso.trim() || !emojiPerso.trim() || busyPerso}
              onClick={() => void creerEntreePersonnalisee()}
            >
              {busyPerso ? 'Création…' : 'Créer et enregistrer'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full py-2.5 text-sm"
              onClick={() => setCreation(false)}
            >
              Annuler
            </Button>
          </div>
        </Sheet>
      )
    }

    return (
      <Sheet title="Ajouter une entrée" onClose={onClose}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Personnalisé
            </p>
            <div className="space-y-1.5">
              {entreesPerso.map((c) => (
                <Ligne
                  key={c.id}
                  nom={c.nom}
                  emoji={c.emoji}
                  etoile
                  onClick={() => setChoisi(entreeVersRaccourci(c))}
                />
              ))}
              <Button
                type="button"
                variant="secondary"
                className="w-full py-2.5 text-sm"
                onClick={() => setCreation(true)}
              >
                + Entrée personnalisée
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Autres entrées
            </p>
            <div className="space-y-1.5">
              {ENTREES_HORS_CATALOGUE.map((e) => (
                <Ligne
                  key={e.nom}
                  nom={e.nom}
                  emoji={emojiEvenement(e.type, e.nom)}
                  onClick={() => setChoisi(e)}
                />
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
                    emoji={emojiEvenement('symptome', s.nom)}
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
  const cotations = COTATIONS_SPECIFIQUES[choisi.nom] ?? COTATIONS
  const cotationPersonnalisee = choisi.nom in COTATIONS_SPECIFIQUES

  return (
    <Sheet
      title={`${choisi.emoji ?? emojiEvenement(choisi.type, choisi.nom)} ${choisi.nom}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        {choisi.type === 'selle' && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Photo (optionnel)</p>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="mb-2 max-h-48 w-full rounded-xl object-cover ring-1 ring-slate-200"
              />
            ) : photoActuelle && !photoSupprimee ? (
              <img
                src={stoolPhotoUrl(photoActuelle)}
                alt=""
                className="mb-2 max-h-48 w-full rounded-xl object-cover ring-1 ring-slate-200"
              />
            ) : null}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setFichierPhoto(e.target.files?.[0] ?? null)
                setPhotoSupprimee(false)
                setAnalyseIA(null)
                setErreurAnalyse(null)
              }}
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800"
            />
            {(fichierPhoto || (photoActuelle && !photoSupprimee)) && (
              <button
                type="button"
                onClick={() => {
                  setFichierPhoto(null)
                  setPhotoSupprimee(true)
                  setAnalyseIA(null)
                  setErreurAnalyse(null)
                }}
                className="mt-2 text-sm font-medium text-red-700 underline"
              >
                Retirer la photo
              </button>
            )}

            {fichierPhoto && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full py-2.5 text-sm"
                  disabled={busyAnalyse}
                  onClick={() => void analyserPhoto()}
                >
                  {busyAnalyse
                    ? 'Analyse en cours…'
                    : isPremium
                      ? '🤖 Analyser avec l’IA'
                      : '🔒 Analyser avec l’IA'}
                </Button>
                {analyseIA && (
                  <p
                    className={`mt-2 text-sm ${analyseIA.score !== null ? 'text-slate-700' : 'text-amber-800'}`}
                  >
                    {analyseIA.score !== null
                      ? `Score suggéré : ${analyseIA.score} (confiance ${analyseIA.confiance}) — ${analyseIA.justification}`
                      : analyseIA.justification}
                  </p>
                )}
                <ErrorMessage>{erreurAnalyse}</ErrorMessage>
              </div>
            )}

            <ErrorMessage>{erreurPhoto}</ErrorMessage>
          </div>
        )}

        {choisi.echelle && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {purina ? 'Score fécal' : cotationPersonnalisee ? 'Qualité' : 'Intensité'}
            </p>
            <div className={`grid gap-1.5 ${purina ? 'grid-cols-7' : 'grid-cols-3'}`}>
              {(purina ? FECAL_SCORES.map((f) => f.score) : cotations.map((c) => c.valeur)).map(
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
                  : cotations.find((c) => c.valeur === intensite)?.label}
            </p>
            {purina && (
              <a
                href="https://www.purinainstitute.com/sites/default/files/2024-08/fecal-scoring-chart-FR.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm font-medium text-brand-700 underline"
              >
                Voir la grille illustrée Purina (PDF)
              </a>
            )}
          </div>
        )}

        {choisi.type === 'repas' && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Quantité mangée (optionnel)</p>
              <div className="grid grid-cols-3 gap-1.5">
                {QUANTITE_REPAS_OPTIONS.map((q) => {
                  const actif = quantiteRepas === q.value
                  return (
                    <button
                      key={q.value}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => setQuantiteRepas(actif ? null : q.value)}
                      className={`rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                        actif
                          ? QUANTITE_TONE_CLASSES[q.tone].actif
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {q.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Appétit (optionnel)</p>
              <SegmentedControl
                options={APPETIT_OPTIONS}
                value={appetitRepas}
                onChange={setAppetitRepas}
              />
            </div>
          </>
        )}

        {choisi.type === 'selle' && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Taille (optionnel)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TAILLES_SELLE.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={taille === t.value}
                  onClick={() => setTaille(taille === t.value ? null : t.value)}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    taille === t.value
                      ? 'bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {choisi.type === 'selle' && (
          <Field label="Couleur (optionnel)">
            <select
              value={couleur ?? ''}
              onChange={(e) => setCouleur(e.target.value || null)}
              className={inputClass}
            >
              <option value="">—</option>
              {COULEURS_SELLE.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {choisi.type === 'selle' && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            {DETAILS_SELLE.map((d) => (
              <label key={d.key} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm text-slate-800">{d.label}</span>
                  {d.description && (
                    <span className="block text-xs text-slate-500">{d.description}</span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={signes[d.key] ?? false}
                  onChange={(e) => setSignes((s) => ({ ...s, [d.key]: e.target.checked }))}
                  className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
                />
              </label>
            ))}
          </div>
        )}

        {verrouAnalyseOuvert && (
          <Sheet title="Score fécal par IA" onClose={() => setVerrouAnalyseOuvert(false)}>
            <Verrou
              titre="Score fécal par IA"
              description="Analyse la photo de la selle et suggère un score sur l'échelle de Purina — réservé au premium. Le score reste modifiable avant d'enregistrer."
            />
          </Sheet>
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
          disabled={(choisi.echelle && intensite === null) || busyPhoto}
          onClick={() => void handleEnregistrer()}
        >
          {busyPhoto ? 'Envoi de la photo…' : evenement ? 'Enregistrer les modifications' : 'Enregistrer'}
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

function Ligne({
  nom,
  emoji,
  etoile,
  onClick,
}: {
  nom: string
  emoji?: string
  /** Marque une entrée personnalisée, pour la distinguer du catalogue prédéfini. */
  etoile?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-left text-sm text-slate-800 hover:bg-slate-100"
    >
      {emoji && (
        <span aria-hidden="true" className="text-base">
          {emoji}
        </span>
      )}
      <span className="flex-1">{nom}</span>
      {etoile && (
        <span aria-hidden="true" title="Entrée personnalisée" className="text-sm text-amber-500">
          ⭐
        </span>
      )}
    </button>
  )
}

/** Choix des deux raccourcis de l'écran d'accueil. */
function ConfigSheet({
  dog,
  entreesPerso,
  onClose,
  onSaved,
}: {
  dog: Dog
  entreesPerso: CustomEntry[]
  onClose: () => void
  onSaved: (dog: Dog) => void
}) {
  const [choix, setChoix] = useState<Raccourci[]>(dog.saisie_rapide ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const tousLesChoix: Raccourci[] = [...CHOIX_POSSIBLES, ...entreesPerso.map(entreeVersRaccourci)]

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
        {tousLesChoix.map((r) => (
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
            <span aria-hidden="true">{r.emoji ?? emojiEvenement(r.type, r.nom)}</span>
            <span className="flex-1 text-sm text-slate-800">{r.nom}</span>
            {r.personnalise && (
              <span aria-hidden="true" title="Entrée personnalisée" className="text-sm text-amber-500">
                ⭐
              </span>
            )}
            {r.categorie && r.categorie !== CATEGORIE_PERSONNALISEE && (
              <span className="text-xs text-slate-500">{r.categorie}</span>
            )}
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
