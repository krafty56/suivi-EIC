import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appointment } from '../lib/types'
import { formatLongDate, formatTime, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

const SUGGESTIONS_MOTIF = [
  'Consultation de contrôle',
  'Analyses de sang',
  'Échographie',
  'Vaccin',
]

export default function AgendaScreen({ dogId }: Props) {
  const [rendezVous, setRendezVous] = useState<Appointment[] | null>(null)
  const [ajout, setAjout] = useState<'nouveau' | Appointment | null>(null)
  const [reperesOuverts, setReperesOuverts] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <Button type="button" className="w-full" onClick={() => setAjout('nouveau')}>
        📅 Ajouter un rendez-vous
      </Button>

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
            <NiveauUrgence titre="Urgence vétérinaire immédiate" tonalite="rouge">
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
            </NiveauUrgence>

            <NiveauUrgence titre="Consultation urgente, si possible le jour même" tonalite="orange">
              <ListeReperes
                items={[
                  'Perte de poids supérieure à 5 % du poids corporel en deux à quatre semaines',
                  'Apparition soudaine de liquide dans l’abdomen ou d’un gonflement périphérique',
                  'Refus de s’alimenter pendant plus de 24 heures',
                  'Selles noires ou goudronneuses de façon persistante',
                  'Changement brutal et marqué par rapport à un état stable connu',
                ]}
              />
            </NiveauUrgence>

            <NiveauUrgence titre="Consultation non urgente, à programmer" tonalite="calme">
              <p className="text-sm text-slate-700">
                Ramollissement progressif des selles persistant plus de cinq à sept jours,
                réapparition de vomissements intermittents après une période de rémission, perte de
                poids progressive sur plusieurs semaines, ou changement d’aspect du pelage se
                développant lentement.
              </p>
            </NiveauUrgence>

            <p className="text-xs text-slate-500">
              Repères indicatifs, à adapter avec votre vétérinaire — ils ne remplacent pas son avis.
            </p>
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
              <LigneRendezVous key={r.id} r={r} onEdit={() => setAjout(r)} onDelete={() => void supprimer(r.id)} />
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
              <LigneRendezVous key={r.id} r={r} onEdit={() => setAjout(r)} onDelete={() => void supprimer(r.id)} />
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
    </div>
  )
}

const TONALITES = {
  rouge: { carte: 'bg-red-50 ring-1 ring-red-200', titre: 'text-red-800' },
  orange: { carte: 'bg-amber-100', titre: 'text-amber-800' },
  calme: { carte: 'bg-slate-50 ring-1 ring-brand-200', titre: 'text-slate-800' },
} as const

function NiveauUrgence({
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
  onEdit,
  onDelete,
}: {
  r: Appointment
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50"
        >
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
        </button>
        <button
          type="button"
          aria-label={`Supprimer le rendez-vous du ${formatLongDate(r.date)}`}
          onClick={onDelete}
          className="shrink-0 self-start rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
        >
          &times;
        </button>
      </div>
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
