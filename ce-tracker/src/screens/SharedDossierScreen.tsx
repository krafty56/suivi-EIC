import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Crise, DailyEntry, SharedDossier, SuiviEvent } from '../lib/types'
import {
  APPETIT_OPTIONS,
  BCS_SCALE,
  CHANGEMENT_OPTIONS,
  ENERGIE_OPTIONS,
  FECAL_SCORES,
  GRAVITE_OPTIONS,
} from '../data/catalogs'
import { TOUS_LES_ITEMS } from '../data/scores'
import { calculerAge, formatLongDate, formatShortDate, formatTime } from '../lib/date'
import { Button, Card, Spinner } from '../components/ui'
import Logo from '../components/Logo'
import { labPhotoUrl } from '../lib/storage'

type Props = { token: string }

export default function SharedDossierScreen({ token }: Props) {
  const [dossier, setDossier] = useState<SharedDossier | null>(null)
  const [invalide, setInvalide] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('get_shared_dossier', { p_token: token })
      if (error) {
        setInvalide(error.message)
        return
      }
      if (!data) {
        setInvalide('Ce lien de partage est invalide, expiré ou révoqué.')
        return
      }
      setDossier(data as SharedDossier)
    }
    void load()
  }, [token])

  if (invalide) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <h1 className="text-lg font-bold text-slate-900">Dossier inaccessible</h1>
          <p className="mt-2 text-sm text-slate-600">{invalide}</p>
          <p className="mt-2 text-sm text-slate-500">
            Demandez au propriétaire de générer un nouveau lien.
          </p>
        </Card>
      </div>
    )
  }

  if (!dossier) return <Spinner label="Ouverture du dossier…" />

  const { dog, share, medications, entries, crises, events, lab_reports, weights, scores } =
    dossier
  const actifs = medications.filter((m) => m.actif)
  const jourDe = (at: string) => {
    const d = new Date(at)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  }
  const dates = [
    ...new Set([
      ...entries.map((e) => e.date),
      ...crises.map((c) => c.date),
      ...events.map((e) => jourDe(e.at)),
    ]),
  ].sort((a, b) => b.localeCompare(a))

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Logo taille={20} className="mb-2" />
          <h1 className="text-xl font-bold text-slate-900">Dossier de suivi — {dog.name}</h1>
          <p className="text-sm text-slate-600">
            Entéropathie chronique · lecture seule · lien valable jusqu’au{' '}
            {formatLongDate(share.expires_at.slice(0, 10))}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 py-2 text-sm print:hidden"
          onClick={() => window.print()}
        >
          Imprimer / PDF
        </Button>
      </header>

      <Card>
        <h2 className="mb-2 font-bold text-slate-900">Fiche</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Ligne terme="Race" valeur={dog.race} />
          <Ligne terme="Âge" valeur={dog.date_naissance ? `${calculerAge(dog.date_naissance)} ans` : null} />
          <Ligne terme="Puce / tatouage" valeur={dog.identification} />
          <Ligne terme="Poids actuel" valeur={dog.poids_actuel !== null ? `${dog.poids_actuel} kg` : null} />
          <Ligne terme="Poids idéal" valeur={dog.poids_ideal !== null ? `${dog.poids_ideal} kg` : null} />
          <Ligne
            terme="BCS"
            valeur={
              dog.bcs !== null
                ? `${dog.bcs}/9 — ${BCS_SCALE.find((b) => b.value === dog.bcs)?.label}`
                : null
            }
          />
          <Ligne
            terme="Diagnostic"
            valeur={dog.date_diagnostic ? formatLongDate(dog.date_diagnostic) : null}
          />
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold text-slate-900">Traitement en cours</h2>
        {actifs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun médicament actif.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actifs.map((medication) => (
              <li key={medication.id} className="flex justify-between gap-3">
                <span className="text-slate-800">
                  {medication.nom_medicament}
                  {medication.dose && <span className="text-slate-500"> · {medication.dose}</span>}
                </span>
                {medication.heure_prise && (
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {formatTime(medication.heure_prise)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {medications.length > actifs.length && (
          <p className="mt-2 text-xs text-slate-500">
            {medications.length - actifs.length} médicament(s) arrêté(s) figurent aussi au dossier.
          </p>
        )}
      </Card>

      {scores.length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold text-slate-900">Indices d’activité</h2>
          <p className="mb-3 text-xs text-slate-500">
            CIBDAI sur 18 (six critères cliniques), CCECAI sur 27 (avec albuminémie, ascite et
            prurit). Cotation renseignée par le propriétaire.
          </p>
          <div className="space-y-3">
            {[...new Set(scores.map((s) => s.date))].map((date) => {
              const dujour = scores.filter((s) => s.date === date)
              const detail = dujour.find((s) => s.indice === 'ccecai') ?? dujour[0]
              return (
                <div key={date} className="break-inside-avoid border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                  <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
                    {formatLongDate(date)}
                  </p>
                  <p className="text-sm text-slate-700">
                    {dujour
                      .map(
                        (s) =>
                          `${s.indice.toUpperCase()} ${s.total}/${s.indice === 'cibdai' ? 18 : 27} — ${s.severite}`,
                      )
                      .join(' · ')}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {TOUS_LES_ITEMS.filter((item) => item.id in detail.items)
                      .map((item) => `${item.critere} ${detail.items[item.id]}`)
                      .join(' · ')}
                  </p>
                  {detail.note && <p className="mt-0.5 text-sm text-slate-500 italic">{detail.note}</p>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {weights.length > 1 && (
        <Card>
          <h2 className="mb-2 font-bold text-slate-900">Poids</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            {weights.map((mesure) => (
              <li key={mesure.id} className="tabular-nums">
                {formatShortDate(mesure.date)} · {mesure.poids} kg
              </li>
            ))}
          </ul>
        </Card>
      )}

      {lab_reports.length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold text-slate-900">Comptes rendus de laboratoire</h2>
          <div className="space-y-4">
            {lab_reports.map((report) => (
              <figure key={report.id}>
                <figcaption className="text-sm font-medium text-slate-700 first-letter:uppercase">
                  {formatLongDate(report.date)}
                  {report.lab_name && (
                    <span className="font-normal text-slate-500"> — {report.lab_name}</span>
                  )}
                  {report.albumine !== null && (
                    <span className="font-normal text-slate-600"> — albuminémie {report.albumine} g/L</span>
                  )}
                </figcaption>
                {report.storage_path && (
                  <img
                    src={labPhotoUrl(report.storage_path)}
                    alt={`Compte rendu du ${report.date}`}
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200"
                  />
                )}
                {report.note && <p className="mt-1 text-sm text-slate-700">{report.note}</p>}
              </figure>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-bold text-slate-900">Journal</h2>
        {dates.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune saisie enregistrée.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dates.map((date) => (
              <Journee
                key={date}
                date={date}
                entry={entries.find((e) => e.date === date) ?? null}
                crises={crises.filter((c) => c.date === date)}
                events={events.filter((e) => jourDe(e.at) === date)}
              />
            ))}
          </div>
        )}
      </Card>

      <p className="pb-6 text-center text-xs text-slate-400">
        Document généré depuis appeic, le carnet de bord du propriétaire. Les données sont déclaratives.
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

function Journee({
  date,
  entry,
  crises,
  events,
}: {
  date: string
  entry: DailyEntry | null
  crises: Crise[]
  events: SuiviEvent[]
}) {
  const heure = (at: string) =>
    new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="py-3 break-inside-avoid">
      <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
        {formatLongDate(date)}
      </p>

      {crises.map((crise) => (
        <div key={crise.id} className="mt-1 rounded-lg bg-red-50 px-2 py-1.5">
          <p className="text-sm font-bold text-red-800">
            Crise signalée
            {crise.changements.length > 0 &&
              ` — ${crise.changements
                .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                .join(', ')}`}
          </p>
          {crise.note && <p className="text-sm text-red-900">{crise.note}</p>}
        </div>
      ))}

      {events.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
          {[...events].reverse().map((event) => (
            <li key={event.id} className="tabular-nums">
              {heure(event.at)} — <span className="tabular-nums">{event.nom}</span>
              {event.intensite !== null && ` (${event.intensite})`}
              {event.categorie && <span className="text-slate-500"> · {event.categorie}</span>}
            </li>
          ))}
        </ul>
      )}

      {entry ? (
        <>
          <p className="mt-1 text-sm text-slate-700">
            {entry.score_fecal !== null && (
              <span className="font-medium">
                Score fécal {entry.score_fecal} (
                {FECAL_SCORES.find((f) => f.score === entry.score_fecal)?.description.toLowerCase()})
              </span>
            )}
            {entry.appetit && (
              <>
                {' · '}appétit{' '}
                {APPETIT_OPTIONS.find((o) => o.value === entry.appetit)?.label.toLowerCase()}
              </>
            )}
            {entry.energie && (
              <>
                {' · '}énergie{' '}
                {ENERGIE_OPTIONS.find((o) => o.value === entry.energie)?.label.toLowerCase()}
              </>
            )}
            {entry.vomissements_count > 0 && <> · {entry.vomissements_count} vomissement(s)</>}
            {entry.selles_count !== null && <> · {entry.selles_count} selle(s)</>}
          </p>

          {entry.symptoms.length > 0 && (
            <p className="mt-0.5 text-sm text-slate-600">
              {entry.symptoms
                .map(
                  (s) =>
                    `${s.nom} (${GRAVITE_OPTIONS.find((g) => g.value === s.gravite)?.label.toLowerCase()})`,
                )
                .join(', ')}
            </p>
          )}

          {entry.notes && <p className="mt-0.5 text-sm text-slate-500 italic">{entry.notes}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Pas de saisie quotidienne.</p>
      )}
    </div>
  )
}
