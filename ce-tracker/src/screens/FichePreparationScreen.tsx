import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Absence,
  Appointment,
  Crise,
  DailyEntry,
  Dog,
  DogMedication,
  LabValue,
  SuiviEvent,
  Weight,
} from '../lib/types'
import { CHANGEMENT_OPTIONS } from '../data/catalogs'
import { formatLongDate, formatShortDate, formatTime, todayISO } from '../lib/date'
import { jourDe } from '../lib/journal'
import { statsFenetre } from '../lib/reponseTraitement'
import { calculerTendance, grouperParParametre, libelleFlag } from '../lib/labValues'
import { Button, Card, Spinner } from '../components/ui'
import Logo from '../components/Logo'

type Props = { dog: Dog; appointment: Appointment; onClose: () => void }

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Synthèse à emporter au rendez-vous, plutôt que le journal chronologique
 * complet (voir ExportPdfScreen) : ce qui s'est passé depuis le dernier
 * rendez-vous, condensé en quelques chiffres et repères. Rendu hors de la
 * coquille de l'application, comme l'export PDF, pour que window.print()
 * sorte tout le document. */
export default function FichePreparationScreen({ dog, appointment, onClose }: Props) {
  const [chargement, setChargement] = useState(true)
  const [debut, setDebut] = useState<string | null>(null)
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [crises, setCrises] = useState<Crise[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [medications, setMedications] = useState<DogMedication[]>([])
  const [traitementEvents, setTraitementEvents] = useState<SuiviEvent[]>([])
  const [poids, setPoids] = useState<Weight[]>([])
  const [labValues, setLabValues] = useState<LabValue[]>([])
  const [error, setError] = useState<string | null>(null)

  const fin = todayISO()

  useEffect(() => {
    async function charger() {
      setChargement(true)
      setError(null)

      const { data: precedent, error: precedentError } = await supabase
        .from('appointments')
        .select('date')
        .eq('dog_id', dog.id)
        .lt('date', appointment.date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (precedentError) {
        setError(precedentError.message)
        setChargement(false)
        return
      }

      const debutPeriode = precedent?.date && precedent.date < fin ? precedent.date : reculerDe(fin, 29)
      setDebut(debutPeriode)

      const [e, ev, c, ab, m, te, p, lv] = await Promise.all([
        supabase.from('daily_entries').select('*').eq('dog_id', dog.id).gte('date', debutPeriode).lte('date', fin),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('at', `${debutPeriode}T00:00:00`)
          .limit(10000),
        supabase
          .from('crises')
          .select('*')
          .eq('dog_id', dog.id)
          .lte('date_debut', fin)
          .or(`date_fin.is.null,date_fin.gte.${debutPeriode}`)
          .order('date_debut'),
        supabase
          .from('absences')
          .select('*')
          .eq('dog_id', dog.id)
          .lte('date_debut', fin)
          .or(`date_fin.is.null,date_fin.gte.${debutPeriode}`)
          .order('date_debut'),
        supabase.from('dog_medications').select('*').eq('dog_id', dog.id).order('actif', { ascending: false }),
        supabase.from('events').select('*').eq('dog_id', dog.id).eq('type', 'traitement').order('at').limit(5000),
        supabase.from('weights').select('*').eq('dog_id', dog.id).order('date', { ascending: true }),
        supabase.from('lab_values').select('*').eq('dog_id', dog.id).order('date', { ascending: true }),
      ])

      const dbError =
        e.error ?? ev.error ?? c.error ?? ab.error ?? m.error ?? te.error ?? p.error ?? lv.error
      if (dbError) {
        setError(dbError.message)
        setChargement(false)
        return
      }

      setEntries(e.data as DailyEntry[])
      setEvents(ev.data as SuiviEvent[])
      setCrises(c.data as Crise[])
      setAbsences(ab.data as Absence[])
      setMedications(m.data as DogMedication[])
      setTraitementEvents(te.data as SuiviEvent[])
      setPoids(p.data as Weight[])
      setLabValues(lv.data as LabValue[])
      setChargement(false)
    }
    void charger()
  }, [dog.id, appointment.date, fin])

  const stats = useMemo(
    () => (debut ? statsFenetre(debut, fin, entries, events, crises) : null),
    [debut, fin, entries, events, crises],
  )

  const crisesPeriode = useMemo(
    () => (debut ? crises.filter((c) => c.date_debut >= debut) : []),
    [crises, debut],
  )

  const absencesPeriode = useMemo(
    () => (debut ? absences.filter((a) => (a.date_fin ?? fin) >= debut) : []),
    [absences, debut, fin],
  )

  const actifs = medications.filter((m) => m.actif)

  const nouveauxTraitements = useMemo(() => {
    if (!debut) return []
    return actifs.filter((m) => {
      const premier = traitementEvents.find((e) => e.dog_medication_id === m.id)
      return premier && jourDe(premier.at) >= debut
    })
  }, [actifs, traitementEvents, debut])

  const poidsActuel = poids.length > 0 ? poids[poids.length - 1] : null
  const poidsDebut = debut ? [...poids].reverse().find((p) => p.date <= debut) : null

  const groupesLabo = useMemo(() => grouperParParametre(labValues), [labValues])
  const laboASignaler = useMemo(
    () =>
      groupesLabo.filter((g) => {
        const tendance = calculerTendance(g.mesures)
        return (g.derniere.flag && g.derniere.flag !== 'normal') || (tendance && Math.abs(tendance.pct) >= 25)
      }),
    [groupesLabo],
  )

  if (chargement) return <Spinner label="Préparation de la fiche…" />

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4 print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Retour
        </button>
        <Button type="button" variant="secondary" className="py-2 text-sm" onClick={() => window.print()}>
          Imprimer / PDF
        </Button>
      </header>

      <div>
        <Logo taille={20} className="mb-2" />
        <h1 className="text-xl font-bold text-slate-900">
          {dog.name} — Préparation du rendez-vous
        </h1>
        <p className="text-sm text-slate-600 first-letter:uppercase">
          {formatLongDate(appointment.date)}
          {appointment.heure && ` à ${formatTime(appointment.heure)}`} · {appointment.motif}
          {appointment.clinique && ` · ${appointment.clinique}`}
        </p>
        {debut && (
          <p className="mt-1 text-xs text-slate-500">
            Période couverte : du {formatShortDate(debut)} à aujourd’hui.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Résumé de la période</h2>
        {stats ? (
          <div className="grid grid-cols-4 divide-x divide-slate-200 text-center">
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{stats.joursEnCrise}</p>
              <p className="text-xs text-slate-500">jours en crise</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{stats.vomissements}</p>
              <p className="text-xs text-slate-500">vomissements</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{stats.reflux}</p>
              <p className="text-xs text-slate-500">reflux</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">
                {stats.scoreMoyen !== null ? stats.scoreMoyen.toFixed(1) : '—'}
              </p>
              <p className="text-xs text-slate-500">score fécal moyen</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Aucune donnée sur la période.</p>
        )}
      </Card>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Crises depuis le dernier rendez-vous</h2>
        {crisesPeriode.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune crise signalée sur la période.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {crisesPeriode.map((c) => (
              <li key={c.id}>
                <p className="font-medium text-slate-800">
                  {formatShortDate(c.date_debut)}
                  {c.date_fin ? ` → ${formatShortDate(c.date_fin)}` : ' (en cours)'}
                  {c.changements.length > 0 &&
                    ` — ${c.changements.map((v) => CHANGEMENT_OPTIONS.find((o) => o.value === v)?.label ?? v).join(', ')}`}
                </p>
                {c.note && <p className="text-slate-600">{c.note}</p>}
              </li>
            ))}
          </ul>
        )}
        {absencesPeriode.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            🧳 {absencesPeriode.length} période{absencesPeriode.length > 1 ? 's' : ''} d’absence sur
            l’intervalle ({absencesPeriode
              .map(
                (a) =>
                  `${formatShortDate(a.date_debut)}${a.date_fin ? ` → ${formatShortDate(a.date_fin)}` : ' (en cours)'}`,
              )
              .join(', ')}
            ) : les symptômes n’ont pas pu y être observés.
          </p>
        )}
      </Card>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Traitement</h2>
        {actifs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun médicament actif.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actifs.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="text-slate-800">
                  {m.nom_medicament}
                  {m.dose && <span className="text-slate-500"> · {m.dose}</span>}
                  {nouveauxTraitements.some((n) => n.id === m.id) && (
                    <span className="ml-2 text-xs font-semibold text-brand-700">(nouveau)</span>
                  )}
                </span>
                {m.heure_prise && (
                  <span className="shrink-0 tabular-nums text-slate-500">{formatTime(m.heure_prise)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Poids</h2>
        {poidsActuel ? (
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{poidsActuel.poids} kg</span>{' '}
            <span className="text-slate-500">le {formatShortDate(poidsActuel.date)}</span>
            {poidsDebut && poidsDebut.id !== poidsActuel.id && (
              <span className="text-slate-500">
                {' '}
                ({poidsActuel.poids > poidsDebut.poids ? '+' : ''}
                {(poidsActuel.poids - poidsDebut.poids).toFixed(1)} kg depuis le{' '}
                {formatShortDate(poidsDebut.date)})
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Aucune pesée enregistrée.</p>
        )}
      </Card>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Paramètres de laboratoire à signaler</h2>
        {labValues.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune analyse enregistrée.</p>
        ) : laboASignaler.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tous les derniers paramètres suivis sont dans l’intervalle, sans tendance marquée.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {laboASignaler.map((g) => {
              const tendance = calculerTendance(g.mesures)
              const flagLabel = libelleFlag(g.derniere.flag)
              return (
                <li key={g.key} className="flex justify-between gap-3">
                  <span className="text-slate-800">{g.derniere.parameter_label}</span>
                  <span className="shrink-0 text-right text-slate-600 tabular-nums">
                    {g.derniere.value ?? g.derniere.value_text} {g.derniere.unit ?? ''}
                    {flagLabel && flagLabel !== 'dans l’intervalle' && (
                      <span className="ml-1 text-amber-700">({flagLabel})</span>
                    )}
                    {tendance && Math.abs(tendance.pct) >= 25 && (
                      <span className={tendance.delta > 0 ? 'ml-1 text-red-700' : 'ml-1 text-brand-700'}>
                        {tendance.delta > 0 ? '↗' : '↘'}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="pb-6 text-center text-xs text-slate-400 print:hidden">
        Document généré depuis appeic. Synthèse indicative, à discuter avec votre vétérinaire.
      </p>
    </div>
  )
}
