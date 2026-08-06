import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CarnetSante, TypeCarnetSante, UniteRappel } from '../lib/types'
import { ANTIPARASITAIRES_SUGGERES, UNITES_RAPPEL, VACCINS_SUGGERES } from '../data/catalogs'
import { formatShortDate, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, SegmentedControl, inputClass } from '../components/ui'

type Props = { dogId: string }

const TYPE_OPTIONS: { value: TypeCarnetSante; label: string }[] = [
  { value: 'vaccin', label: '💉 Vaccin' },
  { value: 'antiparasitaire', label: '🛡️ Antiparasitaire' },
  { value: 'autre', label: '📋 Autre' },
]

const EMOJI_TYPE: Record<TypeCarnetSante, string> = {
  vaccin: '💉',
  antiparasitaire: '🛡️',
  autre: '📋',
}

function suggestionsPourType(type: TypeCarnetSante | null): string[] {
  if (type === 'vaccin') return VACCINS_SUGGERES
  if (type === 'antiparasitaire') return ANTIPARASITAIRES_SUGGERES
  return []
}

/** Ton du badge d'échéance : dépassée, proche (7 jours), ou lointaine. */
function tonEcheance(echeance: string): 'rouge' | 'orange' | 'slate' {
  const aujourdhui = todayISO()
  if (echeance < aujourdhui) return 'rouge'
  const dansSeptJours = new Date(`${aujourdhui}T00:00:00`)
  dansSeptJours.setDate(dansSeptJours.getDate() + 7)
  if (echeance <= dansSeptJours.toISOString().slice(0, 10)) return 'orange'
  return 'slate'
}

const CLASSES_ECHEANCE: Record<'rouge' | 'orange' | 'slate', string> = {
  rouge: 'bg-red-100 text-red-700',
  orange: 'bg-amber-100 text-amber-800',
  slate: 'bg-slate-100 text-slate-700',
}

export default function CarnetSanteScreen({ dogId }: Props) {
  const [entrees, setEntrees] = useState<CarnetSante[] | null>(null)
  const [editing, setEditing] = useState<CarnetSante | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('carnet_sante')
      .select('*')
      .eq('dog_id', dogId)
      .order('date_administration', { ascending: false })

    if (dbError) setError(dbError.message)
    else setEntrees(data as CarnetSante[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function supprimer(entree: CarnetSante) {
    if (!confirm(`Supprimer « ${entree.nom} » du carnet de santé ?`)) return
    const { error: dbError } = await supabase.from('carnet_sante').delete().eq('id', entree.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (entrees === null) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Vaccins et antiparasitaires, avec un rappel optionnel à échéance — utile pour ne pas
        rater le prochain rappel de vaccin ou la prochaine dose de vermifuge.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {entrees.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucune entrée pour l’instant.</p>
        </Card>
      )}

      {entrees.map((entree) => (
        <Card key={entree.id} className="p-0">
          <button
            type="button"
            onClick={() => setEditing(entree)}
            className="flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left hover:bg-slate-50"
          >
            <span className="shrink-0 text-xl" aria-hidden="true">
              {EMOJI_TYPE[entree.type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{entree.nom}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                Administré le {formatShortDate(entree.date_administration)}
              </p>
              {entree.note && <p className="mt-1 text-sm text-slate-600">{entree.note}</p>}
              {entree.prochaine_echeance && (
                <span
                  className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSES_ECHEANCE[tonEcheance(entree.prochaine_echeance)]}`}
                >
                  Rappel le {formatShortDate(entree.prochaine_echeance)}
                </span>
              )}
            </div>
          </button>
          <div className="flex border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditing(entree)}
              className="flex-1 px-4 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => void supprimer(entree)}
              className="flex-1 border-l border-slate-100 px-4 py-2 text-center text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        </Card>
      ))}

      <Button type="button" className="w-full" onClick={() => setEditing('new')}>
        Ajouter une entrée
      </Button>

      {editing && (
        <CarnetSanteSheet
          dogId={dogId}
          entree={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function CarnetSanteSheet({
  dogId,
  entree,
  onClose,
  onSaved,
}: {
  dogId: string
  entree: CarnetSante | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<TypeCarnetSante | null>(entree?.type ?? null)
  const [nom, setNom] = useState(entree?.nom ?? '')
  const [dateAdministration, setDateAdministration] = useState(entree?.date_administration ?? todayISO())
  const [rappelValeur, setRappelValeur] = useState(entree?.rappel_valeur?.toString() ?? '')
  const [rappelUnite, setRappelUnite] = useState<UniteRappel>(entree?.rappel_unite ?? 'mois')
  const [note, setNote] = useState(entree?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    if (!type || !nom.trim()) return
    setBusy(true)
    setError(null)

    const valeur = rappelValeur.trim() ? Number(rappelValeur) : null
    const payload = {
      dog_id: dogId,
      type,
      nom: nom.trim(),
      date_administration: dateAdministration,
      rappel_valeur: valeur,
      rappel_unite: valeur ? rappelUnite : null,
      note: note.trim() || null,
    }

    const { error: dbError } = entree
      ? await supabase.from('carnet_sante').update(payload).eq('id', entree.id)
      : await supabase.from('carnet_sante').insert(payload)

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  const suggestions = suggestionsPourType(type)

  return (
    <Sheet title={entree ? 'Modifier l’entrée' : 'Ajouter au carnet de santé'} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Type">
          <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />
        </Field>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={nom === s}
                onClick={() => setNom(s)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  nom === s
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <Field label="Nom">
          <input value={nom} onChange={(e) => setNom(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Administré le">
          <input
            type="date"
            value={dateAdministration}
            max={todayISO()}
            onChange={(e) => setDateAdministration(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Rappel (optionnel)</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Ex. 3"
              value={rappelValeur}
              onChange={(e) => setRappelValeur(e.target.value)}
              className={inputClass}
            />
            <select
              value={rappelUnite}
              onChange={(e) => setRappelUnite(e.target.value as UniteRappel)}
              className={inputClass}
              disabled={!rappelValeur.trim()}
            >
              {UNITES_RAPPEL.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Un rappel sera envoyé la veille de l’échéance, si les notifications sont activées.
          </p>
        </div>

        <Field label="Note (optionnel)">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Lot, clinique, réaction observée…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button
          type="button"
          disabled={busy || !type || !nom.trim()}
          className="w-full"
          onClick={() => void enregistrer()}
        >
          {busy ? 'Enregistrement…' : entree ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
