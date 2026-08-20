import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RepereesPersonnels, Vomissements } from '../lib/types'
import { FECAL_SCORES } from '../data/catalogs'
import { Button, ErrorMessage, Field, Sheet, SegmentedControl, inputClass } from '../components/ui'

type Props = {
  dogId: string
  dogName: string
  repere: RepereesPersonnels | null
  onClose: () => void
  onSaved: () => void
}

const VOMISSEMENTS_OPTIONS: { value: Vomissements; label: string }[] = [
  { value: 'jamais', label: 'Jamais' },
  { value: 'parfois', label: 'Parfois' },
  { value: 'souvent', label: 'Souvent' },
]

function SelecteurScoreFecal({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {FECAL_SCORES.map((f) => (
        <button
          key={f.score}
          type="button"
          aria-pressed={value === f.score}
          onClick={() => onChange(f.score)}
          className={`rounded-lg py-2 text-sm font-bold tabular-nums transition-colors ${
            value === f.score ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {f.score}
        </button>
      ))}
    </div>
  )
}

/** Déclaration à la main des deux bornes de la règle personnelle, pour les
 * chiens sans (encore) assez d'historique réel en base — voir reglePersonnelle.ts. */
export default function RepereInitialSheet({ dogId, dogName, repere, onClose, onSaved }: Props) {
  const [pireScore, setPireScore] = useState(repere?.pire_score_fecal ?? 6)
  const [pireVomissements, setPireVomissements] = useState<Vomissements>(repere?.pire_vomissements ?? 'souvent')
  const [pireTraitement, setPireTraitement] = useState(repere?.pire_traitement ?? '')
  const [pireAlimentation, setPireAlimentation] = useState(repere?.pire_alimentation ?? '')
  const [meilleurScore, setMeilleurScore] = useState(repere?.meilleur_score_fecal ?? 2)
  const [meilleurVomissements, setMeilleurVomissements] = useState<Vomissements>(
    repere?.meilleur_vomissements ?? 'jamais',
  )
  const [meilleurTraitement, setMeilleurTraitement] = useState(repere?.meilleur_traitement ?? '')
  const [meilleurAlimentation, setMeilleurAlimentation] = useState(repere?.meilleur_alimentation ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enregistrer() {
    setBusy(true)
    setError(null)
    const payload = {
      dog_id: dogId,
      pire_score_fecal: pireScore,
      pire_vomissements: pireVomissements,
      pire_traitement: pireTraitement.trim() || null,
      pire_alimentation: pireAlimentation.trim() || null,
      meilleur_score_fecal: meilleurScore,
      meilleur_vomissements: meilleurVomissements,
      meilleur_traitement: meilleurTraitement.trim() || null,
      meilleur_alimentation: meilleurAlimentation.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error: dbError } = await supabase.from('reperes_personnels').upsert(payload, { onConflict: 'dog_id' })
    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={`Repères de départ de ${dogName}`} onClose={onClose}>
      <div className="space-y-6">
        <p className="text-sm text-slate-600">
          Décris le pire épisode et la meilleure période que tu te rappelles, même avant d’utiliser l’app. Ça
          servira de repère en attendant d’avoir assez d’historique réel — la règle se recalibrera ensuite
          automatiquement sur les vraies crises et périodes calmes de {dogName}.
        </p>

        <div className="space-y-3 rounded-2xl bg-red-50/60 p-3 ring-1 ring-red-100">
          <p className="text-sm font-bold text-red-800">Pire épisode</p>
          <Field label="Score fécal (échelle de Purina)">
            <SelecteurScoreFecal value={pireScore} onChange={setPireScore} />
          </Field>
          <Field label="Vomissements">
            <SegmentedControl
              options={VOMISSEMENTS_OPTIONS}
              value={pireVomissements}
              onChange={(v) => v && setPireVomissements(v)}
            />
          </Field>
          <Field label="Traitement à ce moment-là (optionnel)">
            <input
              type="text"
              value={pireTraitement}
              onChange={(e) => setPireTraitement(e.target.value)}
              className={inputClass}
              placeholder="Ex. Métronidazole seul"
            />
          </Field>
          <Field label="Alimentation à ce moment-là (optionnel)">
            <input
              type="text"
              value={pireAlimentation}
              onChange={(e) => setPireAlimentation(e.target.value)}
              className={inputClass}
              placeholder="Ex. Alimentation habituelle"
            />
          </Field>
        </div>

        <div className="space-y-3 rounded-2xl bg-brand-50/40 p-3 ring-1 ring-brand-200">
          <p className="text-sm font-bold text-[#4a5c30]">Meilleure période</p>
          <Field label="Score fécal (échelle de Purina)">
            <SelecteurScoreFecal value={meilleurScore} onChange={setMeilleurScore} />
          </Field>
          <Field label="Vomissements">
            <SegmentedControl
              options={VOMISSEMENTS_OPTIONS}
              value={meilleurVomissements}
              onChange={(v) => v && setMeilleurVomissements(v)}
            />
          </Field>
          <Field label="Traitement à ce moment-là (optionnel)">
            <input
              type="text"
              value={meilleurTraitement}
              onChange={(e) => setMeilleurTraitement(e.target.value)}
              className={inputClass}
              placeholder="Ex. Prednisolone + Hill's i/d"
            />
          </Field>
          <Field label="Alimentation à ce moment-là (optionnel)">
            <input
              type="text"
              value={meilleurAlimentation}
              onChange={(e) => setMeilleurAlimentation(e.target.value)}
              className={inputClass}
              placeholder="Ex. Prednisolone + Hill's i/d"
            />
          </Field>
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : repere ? 'Enregistrer les modifications' : 'Enregistrer'}
        </Button>
      </div>
    </Sheet>
  )
}
