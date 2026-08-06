import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appointment } from '../lib/types'
import { formatLongDate, formatTime, todayISO } from '../lib/date'
import { icsRendezVous, telechargerIcs, urlGoogleCalendar } from '../lib/calendrier'
import { usePremium } from '../lib/premium'
import { useVetMode } from '../lib/vetMode'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { Verrou } from '../components/Verrou'

type Props = { dogId: string; dogName: string; onPreparer: (appointment: Appointment) => void }

const SUGGESTIONS_MOTIF = [
  'Consultation de contrôle',
  'Analyses de sang',
  'Échographie',
  'Vaccin',
]

const ONGLETS_REPERES = [
  { id: 'grele_colon', label: 'Grêle ou côlon' },
  { id: 'autres_signes', label: 'Autres signes' },
  { id: 'lexique', label: 'Lexique labo' },
] as const

type OngletRepere = (typeof ONGLETS_REPERES)[number]['id']

export default function AgendaScreen({ dogId, dogName, onPreparer }: Props) {
  const { isPremium } = usePremium()
  const isVet = useVetMode()
  const [rendezVous, setRendezVous] = useState<Appointment[] | null>(null)
  const [ajout, setAjout] = useState<'nouveau' | Appointment | null>(null)
  const [reperesOuverts, setReperesOuverts] = useState(false)
  const [informationsOuvertes, setInformationsOuvertes] = useState(false)
  const [ongletRepere, setOngletRepere] = useState<OngletRepere>('grele_colon')
  const [verrouOuvert, setVerrouOuvert] = useState(false)
  const [calendrierPour, setCalendrierPour] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)

  function preparer(r: Appointment) {
    if (isPremium) onPreparer(r)
    else setVerrouOuvert(true)
  }

  const load = useCallback(async () => {
    const { data, error: dbError } = await supabase
      .from('appointments')
      .select('*')
      .eq('dog_id', dogId)
      .order('date', { ascending: true })
      .order('heure', { ascending: true, nullsFirst: false })

    if (dbError) setError(dbError.message)
    else setRendezVous(data as Appointment[])
  }, [dogId])

  useEffect(() => {
    void load()
  }, [load])

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('appointments').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (rendezVous === null) return <Spinner />

  const aVenir = rendezVous.filter((r) => r.date >= todayISO())
  const passes = [...rendezVous.filter((r) => r.date < todayISO())].reverse()

  return (
    <div className="space-y-4 p-4">
      {!isVet && (
        <Button type="button" className="w-full" onClick={() => setAjout('nouveau')}>
          📅 Ajouter un rendez-vous
        </Button>
      )}

      <Card>
        <button
          type="button"
          onClick={() => setReperesOuverts((o) => !o)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <p className="text-sm font-semibold text-slate-900">🚨 Quand consulter ?</p>
          <span className="shrink-0 text-sm font-medium text-brand-700 underline">
            {reperesOuverts ? 'Masquer' : 'Voir les repères'}
          </span>
        </button>

        {reperesOuverts && (
          <div className="mt-3 space-y-3">
            <CarteRepere titre="Urgence vétérinaire immédiate" tonalite="rouge">
              <ListeReperes
                items={[
                  'Diarrhée abondante ou sanglante d’apparition brutale',
                  'Effondrement ou léthargie extrême',
                  'Muqueuses pâles ou blanches',
                  'Distension abdominale visible',
                  'Vomissements qui se prolongent au-delà de six heures',
                  'Difficulté respiratoire visible',
                ]}
              />
            </CarteRepere>

            <CarteRepere titre="Consultation urgente, si possible le jour même" tonalite="orange">
              <ListeReperes
                items={[
                  'Perte de poids supérieure à 5 % du poids corporel en deux à quatre semaines',
                  'Apparition soudaine de liquide dans l’abdomen ou d’un gonflement périphérique',
                  'Refus de s’alimenter pendant plus de 24 heures',
                  'Selles noires ou goudronneuses de façon persistante',
                  'Changement brutal et marqué par rapport à un état stable connu',
                ]}
              />
            </CarteRepere>

            <CarteRepere titre="Consultation non urgente, à programmer" tonalite="calme">
              <p className="text-sm text-slate-700">
                Ramollissement progressif des selles persistant plus de cinq à sept jours,
                réapparition de vomissements intermittents après une période de rémission, perte de
                poids progressive sur plusieurs semaines, ou changement d’aspect du pelage se
                développant lentement.
              </p>
            </CarteRepere>

            <p className="text-xs text-slate-500">
              Repères indicatifs, à adapter avec votre vétérinaire — ils ne remplacent pas son avis.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setInformationsOuvertes((o) => !o)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <p className="text-sm font-semibold text-slate-900">📚 Repères cliniques</p>
          <span className="shrink-0 text-sm font-medium text-brand-700 underline">
            {informationsOuvertes ? 'Masquer' : 'Voir les repères'}
          </span>
        </button>

        {informationsOuvertes && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {ONGLETS_REPERES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={ongletRepere === o.id}
                  onClick={() => setOngletRepere(o.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    ongletRepere === o.id
                      ? 'bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {ongletRepere === 'grele_colon' && (
              <div className="space-y-3">
                <CarteRepere titre="Atteinte de l’intestin grêle" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Selles molles et abondantes, perte de poids progressive, appétit variable,
                    parfois augmenté, parfois diminué. Les vomissements, en particulier après les
                    repas ou tôt le matin, sont fréquents quel que soit le sous-type de la maladie.
                  </p>
                </CarteRepere>

                <CarteRepere titre="Atteinte du côlon" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Selles plus fréquentes mais de faible volume, présence de mucus, parfois un peu
                    de sang rouge vif. Ces signes traduisent une atteinte plus distale du tube
                    digestif.
                  </p>
                </CarteRepere>

                <p className="text-xs text-slate-500">
                  Repère indicatif : la présentation clinique est souvent mixte, seul un examen
                  vétérinaire confirme l’origine.
                </p>
              </div>
            )}

            {ongletRepere === 'autres_signes' && (
              <div className="space-y-3">
                <CarteRepere titre="Autres signes" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Certains signes sont rapportés par les propriétaires sans qu’ils fassent
                    immédiatement le lien avec un trouble digestif : léthargie, changement de
                    qualité du pelage, nausées intermittentes se manifestant par du bâillement, du
                    léchage des babines ou l’ingestion d’herbe. Certains chiens manifestent
                    également pour seul symptôme une dysorexie et un appétit qualifié de
                    « capricieux ». Ces signes méritent d’être mentionnés à votre vétérinaire même
                    s’ils semblent mineurs pris isolément.
                  </p>
                </CarteRepere>
              </div>
            )}

            {ongletRepere === 'lexique' && (
              <div className="space-y-3">
                <CarteRepere titre="Albuminémie" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Protéine sanguine produite par le foie. Une baisse (hypoalbuminémie) peut
                    signaler une entéropathie exsudative — une fuite de protéines dans l’intestin —
                    et compte parmi les marqueurs de gravité les plus suivis en EIC.
                  </p>
                </CarteRepere>

                <CarteRepere titre="Cobalamine (vitamine B12)" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Absorbée dans la partie terminale de l’intestin grêle (iléon). Une carence
                    oriente souvent vers une atteinte du grêle ou une insuffisance pancréatique
                    exocrine associée.
                  </p>
                </CarteRepere>

                <CarteRepere titre="Folates (vitamine B9)" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Absorbés dans la partie initiale de l’intestin grêle (duodénum). Un taux
                    anormal oriente vers une atteinte de cette zone ou une prolifération
                    bactérienne intestinale.
                  </p>
                </CarteRepere>

                <CarteRepere titre="PLI (lipase pancréatique spécifique)" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Marqueur de pancréatite, une inflammation souvent associée aux entéropathies
                    chroniques du chien.
                  </p>
                </CarteRepere>

                <CarteRepere titre="Globulines" tonalite="neutre">
                  <p className="text-sm text-slate-700">
                    Autres protéines sanguines ; une hausse peut accompagner une inflammation
                    chronique.
                  </p>
                </CarteRepere>

                <p className="text-xs text-slate-500">
                  Repères généraux, non exhaustifs : seul votre vétérinaire interprète ces valeurs
                  dans leur contexte.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          À venir
        </p>
        {aVenir.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Aucun rendez-vous à venir.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {aVenir.map((r) => (
              <LigneRendezVous
                key={r.id}
                r={r}
                isPremium={isPremium}
                onEdit={isVet ? undefined : () => setAjout(r)}
                onDelete={isVet ? undefined : () => void supprimer(r.id)}
                onPreparer={() => preparer(r)}
                onCalendrier={() => setCalendrierPour(r)}
              />
            ))}
          </div>
        )}
      </div>

      {passes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Passés
          </p>
          <div className="space-y-2">
            {passes.map((r) => (
              <LigneRendezVous
                key={r.id}
                r={r}
                onEdit={isVet ? undefined : () => setAjout(r)}
                onDelete={isVet ? undefined : () => void supprimer(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      {ajout && (
        <RendezVousSheet
          key={ajout === 'nouveau' ? 'nouveau' : ajout.id}
          dogId={dogId}
          rendezVous={ajout === 'nouveau' ? null : ajout}
          onClose={() => setAjout(null)}
          onSaved={() => {
            setAjout(null)
            void load()
          }}
        />
      )}

      {verrouOuvert && (
        <Sheet title="Préparation du rendez-vous" onClose={() => setVerrouOuvert(false)}>
          <Verrou
            titre="Préparation du rendez-vous"
            description="Une fiche de synthèse (crises, traitement, poids, laboratoire depuis le dernier rendez-vous) prête à emporter ou imprimer — réservée au premium."
          />
        </Sheet>
      )}

      {calendrierPour && (
        <Sheet title="📆 Ajouter au calendrier" onClose={() => setCalendrierPour(null)}>
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                window.open(urlGoogleCalendar({ name: dogName }, calendrierPour), '_blank', 'noopener,noreferrer')
                setCalendrierPour(null)
              }}
            >
              Google Calendar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                telechargerIcs(
                  `rdv-${calendrierPour.date}.ics`,
                  icsRendezVous({ name: dogName }, calendrierPour),
                )
                setCalendrierPour(null)
              }}
            >
              Apple Calendrier / Outlook (.ics)
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

const TONALITES = {
  rouge: { carte: 'bg-red-50 ring-1 ring-red-200', titre: 'text-red-800' },
  orange: { carte: 'bg-amber-100', titre: 'text-amber-800' },
  calme: { carte: 'bg-slate-50 ring-1 ring-brand-200', titre: 'text-slate-800' },
  neutre: { carte: 'bg-slate-50 ring-1 ring-slate-200', titre: 'text-slate-800' },
} as const

/** Petite carte de repère informatif (titre + encadré teinté) : partagée
 * entre les paliers d'urgence et la distinction grêle/côlon, qui n'ont pas de
 * hiérarchie de gravité entre elles mais suivent la même mise en page. */
function CarteRepere({
  titre,
  tonalite,
  children,
}: {
  titre: string
  tonalite: keyof typeof TONALITES
  children: React.ReactNode
}) {
  const styles = TONALITES[tonalite]
  return (
    <div>
      <p className={`mb-1.5 text-sm font-bold ${styles.titre}`}>{titre}</p>
      <div className={`rounded-2xl px-3 py-2.5 ${styles.carte}`}>{children}</div>
    </div>
  )
}

function ListeReperes({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm text-slate-800">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true">→</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function LigneRendezVous({
  r,
  isPremium,
  onEdit,
  onDelete,
  onPreparer,
  onCalendrier,
}: {
  r: Appointment
  isPremium?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onPreparer?: () => void
  onCalendrier?: () => void
}) {
  const contenu = (
    <>
      <span className="shrink-0 text-xl" aria-hidden="true">
        📅
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-900 capitalize">{formatLongDate(r.date)}</p>
        <p className="mt-0.5 text-sm text-slate-700">
          {r.motif}
          {r.heure && <span className="text-slate-500"> · {formatTime(r.heure)}</span>}
        </p>
        {r.clinique && <p className="mt-0.5 text-xs text-slate-500">{r.clinique}</p>}
        {r.note && <p className="mt-1 text-sm text-slate-600">{r.note}</p>}
      </div>
    </>
  )
  return (
    <Card className="p-0">
      <div className="flex items-center gap-1 p-1">
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50"
          >
            {contenu}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">{contenu}</div>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={`Supprimer le rendez-vous du ${formatLongDate(r.date)}`}
            onClick={onDelete}
            className="shrink-0 self-start rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
          >
            &times;
          </button>
        )}
      </div>
      {(onCalendrier || onPreparer) && (
        <div className="flex divide-x divide-slate-100 border-t border-slate-100">
          {onCalendrier && (
            <button
              type="button"
              onClick={onCalendrier}
              className="flex-1 px-4 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              📆 Calendrier
            </button>
          )}
          {onPreparer && (
            <button
              type="button"
              onClick={onPreparer}
              className="flex-1 px-4 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              {isPremium ? '🩺 Préparer' : '🔒 Préparer'}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

function RendezVousSheet({
  dogId,
  rendezVous,
  onClose,
  onSaved,
}: {
  dogId: string
  rendezVous: Appointment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(rendezVous?.date ?? todayISO())
  const [heure, setHeure] = useState(rendezVous?.heure?.slice(0, 5) ?? '')
  const [motif, setMotif] = useState(rendezVous?.motif ?? '')
  const [clinique, setClinique] = useState(rendezVous?.clinique ?? '')
  const [note, setNote] = useState(rendezVous?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!motif.trim()) return
    setBusy(true)
    setError(null)
    const valeurs = {
      dog_id: dogId,
      date,
      heure: heure || null,
      motif: motif.trim(),
      clinique: clinique.trim() || null,
      note: note.trim() || null,
    }
    const { error: dbError } = rendezVous
      ? await supabase.from('appointments').update(valeurs).eq('id', rendezVous.id)
      : await supabase.from('appointments').insert(valeurs)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet
      title={`📅 ${rendezVous ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS_MOTIF.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={motif === s}
                onClick={() => setMotif(s)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  motif === s
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Field label="Motif">
          <input value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Heure (optionnel)">
            <input
              type="time"
              value={heure}
              onChange={(e) => setHeure(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Clinique / vétérinaire (optionnel)">
          <input
            value={clinique}
            onChange={(e) => setClinique(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Note (optionnel)">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Ce qu'il faut préparer, ce qui en est ressorti…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button
          type="button"
          disabled={busy || !motif.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : rendezVous ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
