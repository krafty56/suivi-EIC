import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodEntry } from '../lib/types'
import { formatLongDate, formatShortDate, todayISO, veilleDe } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

/** Historique des régimes alimentaires du chien. Chaque entrée marque un
 * changement à une date ; la période court jusqu'au changement suivant (ou
 * jusqu'à aujourd'hui pour le plus récent) — pas de date de fin à saisir. En
 * entéropathie chronique, savoir ce qui a changé et quand est souvent la clé
 * pour relier une amélioration ou une poussée à son déclencheur. */
export default function AlimentationScreen({ dogId }: Props) {
  const [entries, setEntries] = useState<FoodEntry[] | null>(null)
  const [dateDebut, setDateDebut] = useState(todayISO())
  const [marque, setMarque] = useState('')
  const [reference, setReference] = useState('')
  const [quantiteJour, setQuantiteJour] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function charger() {
    const { data, error: dbError } = await supabase
      .from('food_entries')
      .select('*')
      .eq('dog_id', dogId)
      .order('date_debut', { ascending: false })
    if (dbError) setError(dbError.message)
    else setEntries(data as FoodEntry[])
  }

  useEffect(() => {
    void charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogId])

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault()
    if (!marque.trim() && !reference.trim()) {
      setError('Indiquez au moins une marque ou une référence.')
      return
    }
    setBusy(true)
    setError(null)

    const { error: dbError } = await supabase.from('food_entries').insert({
      dog_id: dogId,
      date_debut: dateDebut,
      marque: marque.trim() || null,
      reference: reference.trim() || null,
      quantite_jour: quantiteJour.trim() || null,
      note: note.trim() || null,
    })

    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }

    setMarque('')
    setReference('')
    setQuantiteJour('')
    setNote('')
    await charger()
  }

  async function supprimer(id: string) {
    const { error: dbError } = await supabase.from('food_entries').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else setEntries((prev) => (prev ?? []).filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <form onSubmit={(e) => void enregistrer(e)} className="space-y-3">
          <Field label="Depuis le">
            <input
              type="date"
              value={dateDebut}
              max={todayISO()}
              onChange={(e) => setDateDebut(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marque">
              <input
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                className={inputClass}
                placeholder="Royal Canin"
              />
            </Field>
            <Field label="Référence">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={inputClass}
                placeholder="Gastro Low Fat"
              />
            </Field>
          </div>
          <Field label="Quantité par jour">
            <input
              value={quantiteJour}
              onChange={(e) => setQuantiteJour(e.target.value)}
              className={inputClass}
              placeholder="250 g"
            />
          </Field>
          <Field label="Note" hint="Motif du changement, réaction du chien…">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Enregistrement…' : 'Ajouter ce changement'}
          </Button>
        </form>
      </Card>

      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Aucun changement alimentaire enregistré pour l’instant.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const actuel = i === 0
            const fin = actuel ? null : veilleDe(entries[i - 1].date_debut)
            return (
              <Card key={entry.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {[entry.marque, entry.reference].filter(Boolean).join(' — ') || 'Aliment'}
                      </p>
                      {actuel && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                          Actuel
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {actuel
                        ? `Depuis le ${formatLongDate(entry.date_debut)}`
                        : `Du ${formatShortDate(entry.date_debut)} au ${formatShortDate(fin!)}`}
                    </p>
                    {entry.quantite_jour && (
                      <p className="mt-1 text-sm text-slate-700">{entry.quantite_jour} / jour</p>
                    )}
                    {entry.note && <p className="mt-1 text-sm text-slate-600 italic">{entry.note}</p>}
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer ${entry.marque ?? entry.reference ?? 'cet aliment'}`}
                    onClick={() => void supprimer(entry.id)}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
                  >
                    &times;
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
