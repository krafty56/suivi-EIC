import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Dog, Weight } from '../lib/types'
import { BCS_SCALE } from '../data/catalogs'
import { formatShortDate, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, inputClass } from '../components/ui'

type Props = {
  dog: Dog | null
  ownerId: string
  onSaved: (dog: Dog) => void
}

/** Convertit un champ texte en nombre, en laissant null si vide. */
function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export default function DogFormScreen({ dog, ownerId, onSaved }: Props) {
  const [name, setName] = useState(dog?.name ?? '')
  const [race, setRace] = useState(dog?.race ?? '')
  const [age, setAge] = useState(dog?.age?.toString() ?? '')
  const [poidsActuel, setPoidsActuel] = useState(dog?.poids_actuel?.toString() ?? '')
  const [poidsIdeal, setPoidsIdeal] = useState(dog?.poids_ideal?.toString() ?? '')
  const [bcs, setBcs] = useState<number | null>(dog?.bcs ?? null)
  const [dateDiagnostic, setDateDiagnostic] = useState(dog?.date_diagnostic ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [historique, setHistorique] = useState<Weight[]>([])

  // La perte de poids est un critère du CIBDAI : elle demande une série, pas
  // une valeur écrasée à chaque saisie.
  useEffect(() => {
    if (!dog) return
    void supabase
      .from('weights')
      .select('*')
      .eq('dog_id', dog.id)
      .order('date', { ascending: false })
      .limit(6)
      .then(({ data }) => setHistorique((data ?? []) as Weight[]))
  }, [dog, saved])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setBusy(true)

    const payload = {
      owner_id: ownerId,
      name: name.trim(),
      race: race.trim() || null,
      age: toNumber(age),
      poids_actuel: toNumber(poidsActuel),
      poids_ideal: toNumber(poidsIdeal),
      bcs,
      date_diagnostic: dateDiagnostic || null,
    }

    const query = dog
      ? supabase.from('dogs').update(payload).eq('id', dog.id).select().single()
      : supabase.from('dogs').insert(payload).select().single()

    const { data, error: dbError } = await query
    setBusy(false)

    if (dbError) {
      setError(dbError.message)
      return
    }
    // Le poids du jour rejoint l'historique, sans quoi la perte de poids
    // resterait incalculable.
    const poids = toNumber(poidsActuel)
    if (poids !== null) {
      const { error: weightError } = await supabase
        .from('weights')
        .upsert({ dog_id: (data as Dog).id, date: todayISO(), poids }, { onConflict: 'dog_id,date' })
      if (weightError) {
        setError(weightError.message)
        return
      }
    }

    setSaved(true)
    onSaved(data as Dog)
  }

  const bcsLabel = BCS_SCALE.find((item) => item.value === bcs)?.label

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {!dog && (
        <p className="text-sm text-slate-600">
          Commençons par la fiche de votre chien. Seul le nom est obligatoire, le reste peut être
          complété plus tard.
        </p>
      )}

      <Card className="space-y-4">
        <Field label="Nom">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Race">
          <input value={race} onChange={(e) => setRace(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Âge (années)">
          <input
            inputMode="decimal"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Poids actuel (kg)">
            <input
              inputMode="decimal"
              value={poidsActuel}
              onChange={(e) => setPoidsActuel(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Poids idéal (kg)">
            <input
              inputMode="decimal"
              value={poidsIdeal}
              onChange={(e) => setPoidsIdeal(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {historique.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Derniers poids</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {historique.map((mesure) => (
                <li key={mesure.id} className="tabular-nums">
                  {formatShortDate(mesure.date)} · {mesure.poids} kg
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Date de diagnostic">
          <input
            type="date"
            value={dateDiagnostic}
            onChange={(e) => setDateDiagnostic(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium text-slate-700">Score corporel (BCS)</p>
        <p className="mb-3 text-xs text-slate-500">Échelle de 1 à 9.</p>
        <div className="grid grid-cols-9 gap-1.5">
          {BCS_SCALE.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={bcs === item.value}
              onClick={() => setBcs(bcs === item.value ? null : item.value)}
              className={`aspect-square rounded-lg text-sm font-semibold transition-colors ${
                bcs === item.value
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {item.value}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-5 text-sm text-slate-600">{bcsLabel ?? 'Aucun score sélectionné.'}</p>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {saved && <p className="text-sm font-medium text-brand-700">Fiche enregistrée.</p>}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Enregistrement…' : dog ? 'Enregistrer les modifications' : 'Créer la fiche'}
      </Button>
    </form>
  )
}
