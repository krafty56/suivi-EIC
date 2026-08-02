import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, Dog, DogMedication, SuiviEvent, Weight } from '../lib/types'
import { BCS_SCALE, CHANGEMENT_OPTIONS } from '../data/catalogs'
import { formatLongDate, formatShortDate, formatTime, todayISO } from '../lib/date'
import { type Gravite, graviteJour, jourDe, lignesJour, resumeJour, texteLigne } from '../lib/journal'
import { Button, Card, ErrorMessage, Spinner } from '../components/ui'
import Logo from '../components/Logo'

type Props = { dog: Dog; onClose: () => void }

const PERIODES = [
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
]

const FOND_LIGNE: Record<Gravite, string> = {
  rouge: 'bg-red-50',
  orange: 'bg-amber-100',
  verte: 'bg-white',
  neutre: 'bg-white',
}

const BORD_LIGNE: Record<Gravite, string> = {
  rouge: 'border-l-red-700',
  orange: 'border-l-amber-800',
  verte: 'border-l-brand-200',
  neutre: 'border-l-slate-200',
}

/** Une date YYYY-MM-DD, n jours avant une autre. */
function reculerDe(date: string, jours: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}

/** Journal imprimable à remettre au vétérinaire. Rendu hors de la coquille de
 * l'application (pas de hauteur fixe ni de scroll interne) : c'est ce qui
 * permet à window.print() de sortir tout le document plutôt que le seul
 * écran visible, comme pour le dossier partagé au vétérinaire. */
export default function ExportPdfScreen({ dog, onClose }: Props) {
  const [periodeJours, setPeriodeJours] = useState(90)
  const [medications, setMedications] = useState<DogMedication[]>([])
  const [entries, setEntries] = useState<DailyEntry[] | null>(null)
  const [crises, setCrises] = useState<Crise[]>([])
  const [events, setEvents] = useState<SuiviEvent[]>([])
  const [poids, setPoids] = useState<Weight[]>([])
  const [error, setError] = useState<string | null>(null)

  const fin = todayISO()
  const debut = reculerDe(fin, periodeJours - 1)

  useEffect(() => {
    setEntries(null)
    const debutEvenements = reculerDe(debut, 1)
    const debutTs = new Date(`${debutEvenements}T00:00:00`).toISOString()
    const finExclusive = new Date(`${fin}T00:00:00`)
    finExclusive.setDate(finExclusive.getDate() + 1)
    const finTs = finExclusive.toISOString()

    async function load() {
      const [m, e, c, ev, p] = await Promise.all([
        supabase.from('dog_medications').select('*').eq('dog_id', dog.id).order('actif', { ascending: false }),
        supabase
          .from('daily_entries')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('date', debut)
          .lte('date', fin)
          .order('date'),
        supabase.from('crises').select('*').eq('dog_id', dog.id).gte('date', debut).lte('date', fin).order('date'),
        supabase
          .from('events')
          .select('*')
          .eq('dog_id', dog.id)
          .gte('at', debutTs)
          .lt('at', finTs)
          .order('at')
          .limit(5000),
        supabase.from('weights').select('*').eq('dog_id', dog.id).gte('date', debut).lte('date', fin).order('date'),
      ])
      const dbError = m.error ?? e.error ?? c.error ?? ev.error ?? p.error
      if (dbError) {
        setError(dbError.message)
        return
      }
      setMedications(m.data as DogMedication[])
      setEntries(e.data as DailyEntry[])
      setCrises(c.data as Crise[])
      setEvents(ev.data as SuiviEvent[])
      setPoids(p.data as Weight[])
    }
    void load()
  }, [dog.id, periodeJours, debut, fin])

  const repasEvents = useMemo(() => events.filter((e) => e.type === 'repas'), [events])

  const jours = useMemo(() => {
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

  if (entries === null) return <Spinner label="Préparation du journal…" />

  const actifs = medications.filter((m) => m.actif)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Retour
        </button>
        <div className="flex items-center gap-2">
          {PERIODES.map((periode) => (
            <button
              key={periode.jours}
              type="button"
              aria-pressed={periodeJours === periode.jours}
              onClick={() => setPeriodeJours(periode.jours)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                periodeJours === periode.jours
                  ? 'bg-brand-700 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {periode.label}
            </button>
          ))}
          <Button type="button" variant="secondary" className="py-2 text-sm" onClick={() => window.print()}>
            Imprimer / PDF
          </Button>
        </div>
      </header>

      <ErrorMessage>{error}</ErrorMessage>

      <div>
        <Logo taille={20} className="mb-2" />
        <h1 className="text-xl font-bold text-slate-900">{dog.name} — Journal de suivi</h1>
        <p className="text-sm text-slate-600">
          Entéropathie chronique · du {formatShortDate(debut)} au {formatShortDate(fin)} · généré le{' '}
          {formatShortDate(todayISO())}
        </p>
      </div>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Fiche</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Ligne terme="Race" valeur={dog.race} />
          <Ligne terme="Âge" valeur={dog.age !== null ? `${dog.age} ans` : null} />
          <Ligne terme="Poids actuel" valeur={dog.poids_actuel !== null ? `${dog.poids_actuel} kg` : null} />
          <Ligne terme="Poids idéal" valeur={dog.poids_ideal !== null ? `${dog.poids_ideal} kg` : null} />
          <Ligne
            terme="BCS"
            valeur={
              dog.bcs !== null ? `${dog.bcs}/9 — ${BCS_SCALE.find((b) => b.value === dog.bcs)?.label}` : null
            }
          />
          <Ligne
            terme="Diagnostic"
            valeur={dog.date_diagnostic ? formatLongDate(dog.date_diagnostic) : null}
          />
        </dl>
      </Card>

      <Card className="break-inside-avoid">
        <h2 className="mb-2 font-bold text-slate-900">Traitements en cours</h2>
        {actifs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun médicament actif.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actifs.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="text-slate-800">
                  {m.nom_medicament}
                  {m.dose && <span className="text-slate-500"> · {m.dose}</span>}
                </span>
                {m.heure_prise && (
                  <span className="shrink-0 tabular-nums text-slate-500">{formatTime(m.heure_prise)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="p-4 pb-2 font-bold text-slate-900">Journal chronologique</h2>
        {jours.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500">Aucune saisie sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs print:text-[10px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Résumé</th>
                  <th className="px-3 py-2 font-medium">Détail</th>
                </tr>
              </thead>
              <tbody>
                {jours.map((jour) => {
                  const fond = FOND_LIGNE[jour.gravite]
                  const bord = BORD_LIGNE[jour.gravite]
                  const vide =
                    jour.crises.length === 0 &&
                    jour.resume.reflux === 0 &&
                    jour.resume.selleScore === null &&
                    jour.resume.vomissements === 0
                  return (
                    <tr key={jour.date} className="break-inside-avoid align-top">
                      <td
                        className={`border-b border-l-4 border-b-slate-100 px-3 py-2 font-medium whitespace-nowrap text-slate-800 ${fond} ${bord}`}
                      >
                        {formatShortDate(jour.date)}
                      </td>
                      <td className={`border-b border-b-slate-100 px-3 py-2 text-slate-600 ${fond}`}>
                        <ul className="space-y-0.5">
                          {jour.crises.length > 0 && <li className="font-semibold text-red-700">🚨 crise</li>}
                          {jour.resume.reflux > 0 && <li>{jour.resume.reflux} reflux</li>}
                          {jour.resume.selleScore !== null && <li>selle {jour.resume.selleScore}/7</li>}
                          {jour.resume.vomissements > 0 && (
                            <li>
                              {jour.resume.vomissements} vomissement{jour.resume.vomissements > 1 ? 's' : ''}
                            </li>
                          )}
                          {vide && <li className="text-slate-300">—</li>}
                        </ul>
                      </td>
                      <td className={`border-b border-b-slate-100 px-3 py-2 text-slate-700 ${fond}`}>
                        <ul className="space-y-0.5">
                          {jour.crises.map((crise) => (
                            <li key={crise.id} className="font-medium text-red-800">
                              Crise
                              {crise.changements.length > 0 &&
                                ` — ${crise.changements
                                  .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                                  .join(', ')}`}
                              {crise.note && ` : ${crise.note}`}
                            </li>
                          ))}
                          {[...jour.lignes].reverse().map((ligne) => {
                            const texte = texteLigne(ligne, repasEvents)
                            return (
                              <li key={ligne.id}>
                                <span className="tabular-nums text-slate-400">{texte.heure}</span> {texte.emoji}{' '}
                                {texte.titre}
                                {texte.sousTitre && <span className="text-slate-500"> — {texte.sousTitre}</span>}
                              </li>
                            )
                          })}
                        </ul>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="pb-6 text-center text-xs text-slate-400 print:hidden">
        Document généré depuis appeic. Les données sont déclaratives.
      </p>
    </div>
  )
}

function Ligne({ terme, valeur }: { terme: string; valeur: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{terme}</dt>
      <dd className="font-medium text-slate-900">{valeur ?? '—'}</dd>
    </div>
  )
}
