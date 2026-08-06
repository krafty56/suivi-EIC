import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { Dog, Weight } from '../lib/types'
import { formatShortDate, todayISO } from '../lib/date'
import { useVetMode } from '../lib/vetMode'
import { Button, Card, ErrorMessage, Field, Spinner, inputClass } from '../components/ui'

type Props = { dog: Dog; onDogChange: (dog: Dog) => void }

/** Convertit un champ texte en nombre, en laissant null si vide/invalide. */
function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Historique des pesées, séparé de la fiche : une pesée est une série dans
 * le temps, pas une valeur qu'on écrase en corrigeant autre chose sur le
 * chien (c'est ce qui arrivait quand le poids vivait dans le formulaire de
 * fiche). Liste, graphique, et ajout à une date choisie. */
export default function PoidsScreen({ dog, onDogChange }: Props) {
  const isVet = useVetMode()
  const [weights, setWeights] = useState<Weight[] | null>(null)
  const [date, setDate] = useState(todayISO())
  const [poids, setPoids] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function charger() {
    const { data, error: dbError } = await supabase
      .from('weights')
      .select('*')
      .eq('dog_id', dog.id)
      .order('date', { ascending: true })
    if (dbError) setError(dbError.message)
    else setWeights(data as Weight[])
  }

  useEffect(() => {
    void charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dog.id])

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault()
    const valeur = toNumber(poids)
    if (valeur === null || valeur <= 0) {
      setError('Entrez un poids valide.')
      return
    }
    setBusy(true)
    setError(null)

    const { error: weightError } = await supabase
      .from('weights')
      .upsert({ dog_id: dog.id, date, poids: valeur }, { onConflict: 'dog_id,date' })

    if (weightError) {
      setBusy(false)
      setError(weightError.message)
      return
    }

    // Le poids affiché sur la fiche ne doit refléter que la mesure la plus
    // récente : une saisie a posteriori d'un jour passé ne doit pas l'écraser.
    if (date === todayISO()) {
      const { data, error: dogError } = await supabase
        .from('dogs')
        .update({ poids_actuel: valeur })
        .eq('id', dog.id)
        .select()
        .single()
      if (dogError) {
        setBusy(false)
        setError(dogError.message)
        return
      }
      onDogChange(data as Dog)
    }

    setPoids('')
    await charger()
    setBusy(false)
  }

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('weights').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else setWeights((prev) => (prev ?? []).filter((w) => w.id !== id))
  }

  const points = useMemo(
    () => (weights ?? []).map((w) => ({ label: formatShortDate(w.date), poids: w.poids })),
    [weights],
  )

  return (
    <div className="space-y-4 p-4">
      {!isVet && (
        <Card>
          <form onSubmit={(e) => void enregistrer(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Poids (kg)">
                <input
                  inputMode="decimal"
                  value={poids}
                  onChange={(e) => setPoids(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <ErrorMessage>{error}</ErrorMessage>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Enregistrement…' : 'Ajouter cette pesée'}
            </Button>
          </form>
        </Card>
      )}

      {weights === null ? (
        <Spinner />
      ) : points.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Aucune pesée enregistrée pour l’instant.</p>
        </Card>
      ) : (
        <>
          <Card>
            <p className="mb-2 text-sm font-medium text-slate-700">Évolution</p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(13 24 33 / 0.1)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(label) => `Le ${label}`}
                    formatter={(v) => [`${v} kg`, 'Poids']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  {dog.poids_ideal !== null && (
                    <ReferenceLine
                      y={dog.poids_ideal}
                      stroke="#bfcc94"
                      strokeDasharray="4 4"
                      label={{ value: 'Idéal', position: 'insideTopRight', fontSize: 11, fill: '#4a6076' }}
                    />
                  )}
                  <Line type="monotone" dataKey="poids" stroke="#344966" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-0">
            <p className="p-4 pb-2 text-sm font-medium text-slate-700">Historique</p>
            <ul className="divide-y divide-slate-100">
              {[...weights].reverse().map((mesure) => (
                <li key={mesure.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm tabular-nums text-slate-700">{formatShortDate(mesure.date)}</span>
                  <span className="flex-1 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {mesure.poids} kg
                  </span>
                  {!isVet && (
                    <button
                      type="button"
                      aria-label={`Supprimer la pesée du ${mesure.date}`}
                      onClick={() => void supprimer(mesure.id)}
                      className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
                    >
                      &times;
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
