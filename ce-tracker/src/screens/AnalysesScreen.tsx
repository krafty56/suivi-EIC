import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { Absence, Crise, DailyEntry, DogMedication, FoodEntry, SuiviEvent } from '../lib/types'
import { formatShortDate, todayISO } from '../lib/date'
import { usePremium } from '../lib/premium'
import { comparerTraitements, type ComparaisonTraitement } from '../lib/reponseTraitement'
import { Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { Verrou } from '../components/Verrou'

type Props = { dogId: string }

const PERIODES = [
  { jours: 30, label: '30 j', premium: false },
  { jours: 90, label: '90 j', premium: true },
  { jours: 365, label: '1 an', premium: true },
]

type Jour = { date: string; label: string }

/** Jour local d'un horodatage, au format YYYY-MM-DD. */
function jourDe(at: string): string {
  const d = new Date(at)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

// L'onglet est démonté à chaque changement d'onglet (rendu conditionnel dans
// App.tsx) : sans persistance, la période choisie serait perdue et
// reviendrait à 30 j par défaut à chaque retour sur Analyses.
const STOCKAGE_CLE = 'appeic.analyses.periode'

function chargerPeriode(): { presetActif: number | null; debut: string; fin: string } {
  try {
    const brut = localStorage.getItem(STOCKAGE_CLE)
    const donnees = brut ? JSON.parse(brut) : null
    if (donnees && typeof donnees.debut === 'string' && typeof donnees.fin === 'string') {
      return {
        presetActif: typeof donnees.presetActif === 'number' ? donnees.presetActif : null,
        debut: donnees.debut,
        fin: donnees.fin,
      }
    }
  } catch {
    // Stockage indisponible ou corrompu : on repart des valeurs par défaut.
  }
  return { presetActif: 30, debut: reculerDe(todayISO(), 29), fin: todayISO() }
}

/** Tous les jours entre deux dates incluses, y compris ceux sans donnée :
 * les creux restent visibles plutôt que d'être passés sous silence. */
function joursEntre(debut: string, fin: string): Jour[] {
  if (debut > fin) return []
  const liste: Jour[] = []
  const curseur = new Date(debut)
  const arrivee = new Date(fin)
  while (curseur <= arrivee) {
    const iso = curseur.toISOString().slice(0, 10)
    liste.push({ date: iso, label: formatShortDate(iso) })
    curseur.setDate(curseur.getDate() + 1)
  }
  return liste
}

export default function AnalysesScreen({ dogId }: Props) {
  const { isPremium, loading: premiumLoading } = usePremium()
  const [fin, setFin] = useState(() => chargerPeriode().fin)
  const [debut, setDebut] = useState(() => chargerPeriode().debut)
  const [presetActif, setPresetActif] = useState<number | null>(() => chargerPeriode().presetActif)
  const [verrouOuvert, setVerrouOuvert] = useState(false)

  // Une période étendue ou personnalisée choisie avant de repasser gratuit
  // (ou persistée depuis avant l'introduction du premium) ne doit pas rester
  // accessible indéfiniment via le localStorage.
  useEffect(() => {
    if (premiumLoading || isPremium || presetActif === 30) return
    setPresetActif(30)
    setFin(todayISO())
    setDebut(reculerDe(todayISO(), 29))
  }, [isPremium, premiumLoading, presetActif])

  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [crises, setCrises] = useState<Crise[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [traitements, setTraitements] = useState<ComparaisonTraitement[] | null>(null)
  const [verrouTraitementsOuvert, setVerrouTraitementsOuvert] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STOCKAGE_CLE, JSON.stringify({ presetActif, debut, fin }))
    } catch {
      // Navigation privée ou quota plein : la période ne persiste pas, sans bloquer l'app.
    }
  }, [presetActif, debut, fin])

  useEffect(() => {
    if (debut > fin) return
    setEntries(null)
    async function load() {
      // Bornes en heure locale, comme le journal quotidien : une comparaison
      // directe de la date au timestamptz aurait raisonné en UTC et pu
      // exclure ou inclure à tort les événements proches de minuit.
      const debutTs = new Date(`${debut}T00:00:00`).toISOString()
      const finExclusive = new Date(`${fin}T00:00:00`)
      finExclusive.setDate(finExclusive.getDate() + 1)
      const finTs = finExclusive.toISOString()

      // Bornée à la période choisie : sur la totalité de l'historique du
      // chien, une requête sans borne dépassait la limite de lignes de
      // Supabase et coupait silencieusement les événements les plus récents.
      const [e, c, ab, ev, f] = await Promise.all([
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
        // Même logique de chevauchement que les crises.
        supabase
          .from('absences')
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
        supabase
          .from('food_entries')
          .select('*')
          .eq('dog_id', dogId)
          .gte('date_debut', debut)
          .lte('date_debut', fin)
          .order('date_debut'),
      ])
      if (e.error || c.error || ev.error || f.error) {
        setError((e.error ?? c.error ?? ev.error ?? f.error)!.message)
        return
      }
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
      // Erreur ignorée plutôt que bloquante : le reste des graphiques ne
      // doit pas dépendre du déploiement de la table absences.
      setAbsences(ab.error ? [] : (ab.data as Absence[]))
      setEvents(ev.data as SuiviEvent[])
      setFoodEntries(f.data as FoodEntry[])
    }
    void load()
  }, [dogId, debut, fin])

  // Comparaison avant/après traitement : réservée au premium, et indépendante
  // de la période choisie pour les graphiques — un traitement démarré avant
  // la fenêtre affichée doit quand même apparaître ici.
  useEffect(() => {
    if (!isPremium) {
      setTraitements(null)
      return
    }
    let annule = false
    async function load() {
      const { data: medsData, error: medsError } = await supabase
        .from('dog_medications')
        .select('*')
        .eq('dog_id', dogId)
        .eq('actif', true)
      if (medsError || annule) return
      const medications = (medsData ?? []) as DogMedication[]
      if (medications.length === 0) {
        if (!annule) setTraitements([])
        return
      }

      const { data: teData, error: teError } = await supabase
        .from('events')
        .select('*')
        .eq('dog_id', dogId)
        .eq('type', 'traitement')
        .order('at')
        .limit(5000)
      if (teError || annule) return
      const traitementEvents = (teData ?? []) as SuiviEvent[]

      const debuts = medications
        .map((m) => traitementEvents.find((e) => e.dog_medication_id === m.id))
        .filter((e): e is SuiviEvent => e !== undefined)
        .map((e) => jourDe(e.at))
      if (debuts.length === 0) {
        if (!annule) setTraitements([])
        return
      }

      const aujourdhui = todayISO()
      const fenetreDebut = reculerDe(debuts.sort()[0], 14)

      const [e, c, ev] = await Promise.all([
        supabase.from('daily_entries').select('*').eq('dog_id', dogId).gte('date', fenetreDebut).lte('date', aujourdhui),
        supabase
          .from('crises')
          .select('*')
          .eq('dog_id', dogId)
          .lte('date_debut', aujourdhui)
          .or(`date_fin.is.null,date_fin.gte.${fenetreDebut}`),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dogId)
          .gte('at', `${fenetreDebut}T00:00:00`)
          .limit(10000),
      ])
      if (annule || e.error || c.error || ev.error) return

      setTraitements(
        comparerTraitements(
          medications,
          traitementEvents,
          e.data as DailyEntry[],
          ev.data as SuiviEvent[],
          c.data as Crise[],
          aujourdhui,
        ),
      )
    }
    void load()
    return () => {
      annule = true
    }
  }, [dogId, isPremium])

  function choisirPreset(periode: (typeof PERIODES)[number]) {
    if (periode.premium && !isPremium) {
      setVerrouOuvert(true)
      return
    }
    setPresetActif(periode.jours)
    setFin(todayISO())
    setDebut(reculerDe(todayISO(), periode.jours - 1))
  }

  function changerDebut(valeur: string) {
    if (!isPremium) {
      setVerrouOuvert(true)
      return
    }
    setDebut(valeur)
    setPresetActif(null)
  }

  function changerFin(valeur: string) {
    if (!isPremium) {
      setVerrouOuvert(true)
      return
    }
    setFin(valeur)
    setPresetActif(null)
  }

  const fenetre = useMemo(() => joursEntre(debut, fin), [debut, fin])
  const nbJours = fenetre.length

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
    // Une crise dure de date_debut à date_fin (ou jusqu'à aujourd'hui si
    // encore en cours) : chaque jour de l'épisode compte comme « en crise »,
    // pas seulement le jour où elle a été signalée.
    return fenetre.map((j) => ({
      ...j,
      compte: crises.some((c) => j.date >= c.date_debut && j.date <= (c.date_fin ?? fin)) ? 1 : 0,
    }))
  }, [crises, fenetre, fin])

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

  // Bande grisée délimitée par des libellés de jour (x1/x2), comme les
  // ReferenceLine de changement alimentaire : même repère temporel que le
  // reste des graphiques, clippée à la fenêtre affichée.
  const absencePlages = useMemo(() => {
    const labelDe = new Map(fenetre.map((j) => [j.date, j.label]))
    return absences
      .map((a) => {
        const clippedDebut = a.date_debut > debut ? a.date_debut : debut
        const clippedFin = a.date_fin && a.date_fin < fin ? a.date_fin : fin
        const x1 = labelDe.get(clippedDebut)
        const x2 = labelDe.get(clippedFin)
        if (clippedDebut > clippedFin || !x1 || !x2) return null
        return { id: a.id, x1, x2 }
      })
      .filter((p): p is { id: string; x1: string; x2: string } => p !== null)
  }, [absences, fenetre, debut, fin])

  const reperesAlimentation = useMemo(
    () =>
      foodEntries.map((f) => ({
        id: f.id,
        label: formatShortDate(f.date_debut),
        nom: [f.marque, f.reference].filter(Boolean).join(' — ') || 'Changement alimentaire',
      })),
    [foodEntries],
  )

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
            aria-pressed={presetActif === periode.jours}
            onClick={() => choisirPreset(periode)}
            className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
              presetActif === periode.jours
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {periode.premium && !isPremium ? '🔒 ' : ''}
            {periode.label}
          </button>
        ))}
      </div>

      <Card
        className={!isPremium ? 'opacity-60' : ''}
        onClick={() => !isPremium && setVerrouOuvert(true)}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={isPremium ? 'Du' : '🔒 Du'}>
            <input
              type="date"
              value={debut}
              max={fin}
              disabled={!isPremium}
              onChange={(e) => changerDebut(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={isPremium ? 'Au' : '🔒 Au'}>
            <input
              type="date"
              value={fin}
              min={debut}
              max={todayISO()}
              disabled={!isPremium}
              onChange={(e) => changerFin(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {debut > fin ? (
        <Card>
          <p className="py-4 text-center text-sm text-slate-500">
            La date de début doit précéder la date de fin.
          </p>
        </Card>
      ) : entries === null ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-700">Reflux</p>
              <p className="text-sm tabular-nums text-slate-500">
                {totalReflux} sur {nbJours} jour{nbJours > 1 ? 's' : ''}
              </p>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={refluxPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                  {absencePlages.map((p) => (
                    <ReferenceArea key={p.id} x1={p.x1} x2={p.x2} fill="#64748b" fillOpacity={0.15} />
                  ))}
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(label) => `Le ${label}`}
                    formatter={(v) => [v, 'reflux']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Bar dataKey="compte" name="Reflux" fill="#b4cded" radius={[3, 3, 0, 0]} />
                  {reperesAlimentation.map((r) => (
                    <ReferenceLine
                      key={r.id}
                      x={r.label}
                      stroke="#bfcc94"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{ value: '🍽️', position: 'top', fontSize: 12 }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {reperesAlimentation.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                🍽️ pointillé = changement alimentaire ({reperesAlimentation.map((r) => r.nom).join(', ')})
              </p>
            )}
            {absencePlages.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                🧳 zone grisée = absence du propriétaire, aucun symptôme n'a pu être noté
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-700">Crises</p>
              <p className="text-sm tabular-nums text-slate-500">
                {totalCrises} sur {nbJours} jour{nbJours > 1 ? 's' : ''}
              </p>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crisesPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                  {absencePlages.map((p) => (
                    <ReferenceArea key={p.id} x1={p.x1} x2={p.x2} fill="#64748b" fillOpacity={0.15} />
                  ))}
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(label) => `Le ${label}`}
                    formatter={(v) => [v, 'crise']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Bar dataKey="compte" name="Crises" fill="#c0524b" radius={[3, 3, 0, 0]} />
                  {reperesAlimentation.map((r) => (
                    <ReferenceLine key={r.id} x={r.label} stroke="#bfcc94" strokeWidth={2} strokeDasharray="4 4" />
                  ))}
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
              <p className="py-8 text-center text-sm text-slate-500">
                Aucune donnée sur cette période.
              </p>
            ) : (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scorePoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                    {absencePlages.map((p) => (
                      <ReferenceArea key={p.id} x1={p.x1} x2={p.x2} fill="#64748b" fillOpacity={0.15} />
                    ))}
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      domain={[1, 7]}
                      ticks={[1, 2, 3, 4, 5, 6, 7]}
                      tick={{ fontSize: 11 }}
                      width={28}
                    />
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
                    {reperesAlimentation.map((r) => (
                      <ReferenceLine key={r.id} x={r.label} stroke="#bfcc94" strokeWidth={2} strokeDasharray="4 4" />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Échelle de Purina, de 1 (très dure) à 7 (liquide). Le plus élevé de la journée.
            </p>
          </Card>

          <Card
            className={!isPremium ? 'opacity-60' : ''}
            onClick={() => !isPremium && setVerrouTraitementsOuvert(true)}
          >
            <p className="mb-2 text-sm font-medium text-slate-700">
              {isPremium ? 'Réponse aux traitements' : '🔒 Réponse aux traitements'}
            </p>
            {!isPremium ? (
              <p className="text-sm text-slate-500">
                Compare automatiquement l'état du chien avant et après le début de chaque
                traitement actif.
              </p>
            ) : traitements === null ? (
              <Spinner />
            ) : traitements.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                Pas encore assez de recul pour comparer un traitement (au moins 3 jours depuis
                son début, avec des données saisies avant et après).
              </p>
            ) : (
              <div className="space-y-4">
                {traitements.map((t) => (
                  <div key={t.medicationId} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                    <p className="text-sm font-semibold text-slate-800">{t.nom}</p>
                    <p className="mb-2 text-xs text-slate-500">Depuis le {formatShortDate(t.dateDebut)}</p>
                    <div className="grid grid-cols-3 gap-y-1 gap-x-2 text-xs">
                      <p />
                      <p className="text-center font-medium text-slate-500">Avant</p>
                      <p className="text-center font-medium text-slate-500">Après</p>

                      <p className="text-slate-600">Score fécal</p>
                      <p className="text-center tabular-nums text-slate-800">
                        {t.avant.scoreMoyen !== null ? t.avant.scoreMoyen.toFixed(1) : '—'}
                      </p>
                      <p className="text-center tabular-nums text-slate-800">
                        {t.apres.scoreMoyen !== null ? t.apres.scoreMoyen.toFixed(1) : '—'}
                      </p>

                      <p className="text-slate-600">Jours en crise</p>
                      <p className="text-center tabular-nums text-slate-800">{t.avant.joursEnCrise}</p>
                      <p className="text-center tabular-nums text-slate-800">{t.apres.joursEnCrise}</p>

                      <p className="text-slate-600">Vomissements</p>
                      <p className="text-center tabular-nums text-slate-800">{t.avant.vomissements}</p>
                      <p className="text-center tabular-nums text-slate-800">{t.apres.vomissements}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {verrouOuvert && (
        <Sheet title="Analyses étendues" onClose={() => setVerrouOuvert(false)}>
          <Verrou
            titre="Analyses étendues"
            description="Au-delà de 30 jours, ou avec une période personnalisée, les graphiques sont réservés au premium."
          />
        </Sheet>
      )}

      {verrouTraitementsOuvert && (
        <Sheet title="Réponse aux traitements" onClose={() => setVerrouTraitementsOuvert(false)}>
          <Verrou
            titre="Réponse aux traitements"
            description="Compare automatiquement le score fécal, les crises et les vomissements avant et après le début de chaque traitement actif, pour visualiser son effet réel."
          />
        </Sheet>
      )}
    </div>
  )
}
