import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DogMedication } from '../lib/types'
import { MEDICATION_CATALOG } from '../data/catalogs'
import { formatTime } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'

const AUTRE = '__autre__'

/** Tous les noms du catalogue, pour savoir si un médicament enregistré est une saisie libre. */
const CATALOG_NAMES = MEDICATION_CATALOG.flatMap((group) => group.medicaments)

type Props = { dogId: string }

export default function MedicationsScreen({ dogId }: Props) {
  const [medications, setMedications] = useState<DogMedication[] | null>(null)
  const [editing, setEditing] = useState<DogMedication | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('dog_medications')
      .select('*')
      .eq('dog_id', dogId)
      .order('heure_prise', { ascending: true, nullsFirst: false })
      .order('nom_medicament', { ascending: true })

    if (dbError) setError(dbError.message)
    else setMedications(data as DogMedication[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function toggleActif(medication: DogMedication) {
    const { error: dbError } = await supabase
      .from('dog_medications')
      .update({ actif: !medication.actif })
      .eq('id', medication.id)

    if (dbError) setError(dbError.message)
    else void load()
  }

  async function remove(medication: DogMedication) {
    if (!confirm(`Supprimer ${medication.nom_medicament} du traitement ?`)) return
    const { error: dbError } = await supabase
      .from('dog_medications')
      .delete()
      .eq('id', medication.id)

    if (dbError) setError(dbError.message)
    else void load()
  }

  if (medications === null) return <Spinner />

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Les médicaments actifs apparaissent chaque jour dans la saisie quotidienne. Désactivez un
        médicament plutôt que de le supprimer si le traitement peut reprendre.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {medications.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun médicament configuré pour l’instant.</p>
        </Card>
      )}

      {medications.map((medication) => (
        <Card key={medication.id} className={medication.actif ? '' : 'opacity-60'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{medication.nom_medicament}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {[medication.dose, formatTime(medication.heure_prise)]
                  .filter(Boolean)
                  .join(' · ') || 'Ni dose ni heure renseignée'}
              </p>
              {!medication.actif && (
                <p className="mt-1 text-xs font-medium text-slate-500">Inactif</p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={medication.actif}
              aria-label={`Rendre ${medication.nom_medicament} ${medication.actif ? 'inactif' : 'actif'}`}
              onClick={() => void toggleActif(medication)}
              className={`mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                medication.actif ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                  medication.actif ? 'translate-x-5.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 py-2 text-sm"
              onClick={() => setEditing(medication)}
            >
              Modifier
            </Button>
            <Button
              type="button"
              variant="danger"
              className="py-2 text-sm"
              onClick={() => void remove(medication)}
            >
              Supprimer
            </Button>
          </div>
        </Card>
      ))}

      <Button type="button" className="w-full" onClick={() => setEditing('new')}>
        Ajouter un médicament
      </Button>

      {editing && (
        <MedicationSheet
          dogId={dogId}
          medication={editing === 'new' ? null : editing}
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

function MedicationSheet({
  dogId,
  medication,
  onClose,
  onSaved,
}: {
  dogId: string
  medication: DogMedication | null
  onClose: () => void
  onSaved: () => void
}) {
  const isCustom = medication ? !CATALOG_NAMES.includes(medication.nom_medicament) : false
  const [choice, setChoice] = useState(medication ? (isCustom ? AUTRE : medication.nom_medicament) : '')
  const [customName, setCustomName] = useState(isCustom ? (medication?.nom_medicament ?? '') : '')
  const [dose, setDose] = useState(medication?.dose ?? '')
  const [heure, setHeure] = useState(formatTime(medication?.heure_prise ?? null) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const nom = choice === AUTRE ? customName.trim() : choice
    if (!nom) {
      setError('Choisissez un médicament dans la liste ou saisissez son nom.')
      return
    }

    setError(null)
    setBusy(true)

    const payload = {
      dog_id: dogId,
      nom_medicament: nom,
      dose: dose.trim() || null,
      heure_prise: heure || null,
    }

    const { error: dbError } = medication
      ? await supabase.from('dog_medications').update(payload).eq('id', medication.id)
      : await supabase.from('dog_medications').insert({ ...payload, actif: true })

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={medication ? 'Modifier le médicament' : 'Ajouter un médicament'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Médicament">
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Choisir…
            </option>
            {MEDICATION_CATALOG.map((group) => (
              <optgroup key={group.categorie} label={group.categorie}>
                {group.medicaments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={AUTRE}>Autre…</option>
          </select>
        </Field>

        {choice === AUTRE && (
          <Field label="Nom du médicament">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </Field>
        )}

        <Field label="Dose" hint="Par exemple : 5 mg, 1/2 comprimé, 2 mL">
          <input value={dose} onChange={(e) => setDose(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Heure de prise">
          <input
            type="time"
            value={heure}
            onChange={(e) => setHeure(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Sheet>
  )
}
