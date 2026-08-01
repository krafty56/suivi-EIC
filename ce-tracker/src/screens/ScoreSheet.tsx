import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  ITEMS_CCECAI_SUPPLEMENTAIRES,
  ITEMS_CIBDAI,
  TOUS_LES_ITEMS,
  calculerCCECAI,
  calculerCIBDAI,
  type Reponses,
  type ScoreItem,
} from '../data/scores'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'

type Props = {
  dogId: string
  onClose: () => void
  onSaved: () => void
}

export default function ScoreSheet({ dogId, onClose, onSaved }: Props) {
  const [date, setDate] = useState(todayISO())
  const [reponses, setReponses] = useState<Reponses>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cibdai = calculerCIBDAI(reponses)
  const ccecai = calculerCCECAI(reponses)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!cibdai.complet) {
      setError('Répondez aux six premiers critères pour obtenir un CIBDAI.')
      return
    }
    setError(null)
    setBusy(true)

    const commun = { dog_id: dogId, date, note: note.trim() || null }
    const lignes = [
      {
        ...commun,
        indice: 'cibdai',
        items: Object.fromEntries(
          ITEMS_CIBDAI.map((item) => [item.id, reponses[item.id] ?? 0]),
        ),
        total: cibdai.total,
        severite: cibdai.severite,
      },
    ]
    // Le CCECAI n'est enregistré que si ses neuf critères sont renseignés :
    // un total partiel se lirait comme un score bas, donc rassurant à tort.
    if (ccecai.complet) {
      lignes.push({
        ...commun,
        indice: 'ccecai',
        items: Object.fromEntries(TOUS_LES_ITEMS.map((item) => [item.id, reponses[item.id] ?? 0])),
        total: ccecai.total,
        severite: ccecai.severite,
      })
    }

    const { error: dbError } = await supabase
      .from('clinical_scores')
      .upsert(lignes, { onConflict: 'dog_id,date,indice' })

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title="Nouveau score" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Date de l’évaluation">
          <input
            type="date"
            required
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Critères cliniques — CIBDAI
          </p>
          <div className="mt-3 space-y-5">
            {ITEMS_CIBDAI.map((item) => (
              <Critere
                key={item.id}
                item={item}
                valeur={reponses[item.id]}
                onChange={(v) => setReponses((r) => ({ ...r, [item.id]: v }))}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Critères supplémentaires — CCECAI
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Facultatifs. Sans eux, seul le CIBDAI est enregistré.
          </p>
          <div className="mt-3 space-y-5">
            {ITEMS_CCECAI_SUPPLEMENTAIRES.map((item) => (
              <Critere
                key={item.id}
                item={item}
                valeur={reponses[item.id]}
                onChange={(v) => setReponses((r) => ({ ...r, [item.id]: v }))}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
          <Total
            libelle="CIBDAI"
            sur={18}
            total={cibdai.total}
            severite={cibdai.severite}
            complet={cibdai.complet}
          />
          <Total
            libelle="CCECAI"
            sur={27}
            total={ccecai.total}
            severite={ccecai.severite}
            complet={ccecai.complet}
          />
        </div>

        <Field label="Note">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optionnel : contexte de l’évaluation"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Enregistrement…' : 'Enregistrer le score'}
        </Button>
      </form>
    </Sheet>
  )
}

function Critere({
  item,
  valeur,
  onChange,
}: {
  item: ScoreItem
  valeur: number | undefined
  onChange: (valeur: number) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-900">{item.critere}</legend>
      <div className="space-y-1.5">
        {item.paliers.map((palier, cotation) => {
          const choisi = valeur === cotation
          return (
            <label
              key={cotation}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors ${
                choisi ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200'
              }`}
            >
              <input
                type="radio"
                name={item.id}
                checked={choisi}
                onChange={() => onChange(cotation)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700"
              />
              <span className="flex-1 text-sm text-slate-800">{palier}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500">
                {cotation}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Total({
  libelle,
  sur,
  total,
  severite,
  complet,
}: {
  libelle: string
  sur: number
  total: number
  severite: string
  complet: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-semibold text-slate-900">{libelle}</span>
      {complet ? (
        <span className="text-right">
          <span className="text-lg font-bold tabular-nums text-slate-900">
            {total}
            <span className="text-sm font-medium text-slate-500">/{sur}</span>
          </span>
          <span className="ml-2 text-sm text-slate-600">{severite}</span>
        </span>
      ) : (
        <span className="text-sm text-slate-500">critères incomplets</span>
      )}
    </div>
  )
}
