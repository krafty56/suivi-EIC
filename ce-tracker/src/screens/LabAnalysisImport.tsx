import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LabValue } from '../lib/types'
import { CATEGORIE_LABELS, calculerFlag, parseValeur } from '../lib/labValues'
import { todayISO } from '../lib/date'
import { Button, ErrorMessage, Field, Sheet, inputClass } from '../components/ui'
import { LAB_BUCKET } from '../lib/storage'

type Props = {
  dogId: string
  onClose: () => void
  onSaved: () => void
}

type LigneProposee = {
  cle: string
  parameter_key: string
  parameter_label: string
  category: string | null
  valeur: string
  unit: string | null
  ref_low: number | null
  ref_high: number | null
}

// Marques diacritiques combinantes (U+0300–U+036F) laissées par normalize('NFD').
const DIACRITIQUES = /[̀-ͯ]/g

function slugify(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(DIACRITIQUES, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'parametre'
  )
}

export default function LabAnalysisImportSheet({ dogId, onClose, onSaved }: Props) {
  const [etape, setEtape] = useState<'photo' | 'analyse' | 'relecture'>('photo')
  const [date, setDate] = useState(todayISO())
  const [labName, setLabName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [lignes, setLignes] = useState<LigneProposee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function nettoyerPhoto(path: string) {
    // Best effort : la photo n'est qu'une étape intermédiaire vers les
    // paramètres extraits, pas une pièce jointe à conserver (contrairement au
    // compte rendu). Un échec de nettoyage n'empêche pas de continuer.
    await supabase.storage.from(LAB_BUCKET).remove([path]).catch(() => {})
  }

  async function fermer() {
    if (storagePath) void nettoyerPhoto(storagePath)
    onClose()
  }

  async function analyser(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choisissez une photo nette de l’analyse.')
      return
    }
    setError(null)
    setBusy(true)
    setEtape('analyse')

    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${dogId}/analyses/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(LAB_BUCKET)
      .upload(path, file, { contentType: file.type || undefined })
    if (uploadError) {
      setBusy(false)
      setEtape('photo')
      setError(uploadError.message)
      return
    }
    setStoragePath(path)

    const { data, error: fnError } = await supabase.functions.invoke('extract-lab-values', {
      body: { dogId, storagePath: path },
    })

    setBusy(false)
    if (fnError) {
      setEtape('photo')
      setError(fnError.message)
      return
    }

    const resultat = data as {
      date: string | null
      labName: string | null
      parametres: {
        parameter_key: string
        parameter_label: string
        category: string | null
        value: number | null
        value_text: string | null
        unit: string | null
        ref_low: number | null
        ref_high: number | null
      }[]
    }

    if (resultat.date) setDate(resultat.date)
    if (resultat.labName) setLabName(resultat.labName)
    setLignes(
      resultat.parametres.map((p) => ({
        cle: crypto.randomUUID(),
        parameter_key: p.parameter_key,
        parameter_label: p.parameter_label,
        category: p.category,
        valeur: p.value !== null ? String(p.value) : (p.value_text ?? ''),
        unit: p.unit,
        ref_low: p.ref_low,
        ref_high: p.ref_high,
      })),
    )
    if (resultat.parametres.length === 0) {
      setError(
        'Aucun paramètre reconnu sur cette photo. Reprenez une photo plus nette, ou ajoutez les lignes à la main ci-dessous.',
      )
    }
    setEtape('relecture')
  }

  function modifierLigne(cle: string, patch: Partial<LigneProposee>) {
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)))
  }

  function supprimerLigne(cle: string) {
    setLignes((ls) => ls.filter((l) => l.cle !== cle))
  }

  function ligneVide(): LigneProposee {
    return {
      cle: crypto.randomUUID(),
      parameter_key: '',
      parameter_label: '',
      category: null,
      valeur: '',
      unit: null,
      ref_low: null,
      ref_high: null,
    }
  }

  function ajouterLigne() {
    setLignes((ls) => [...ls, ligneVide()])
  }

  function saisirManuellement() {
    setError(null)
    setLignes([ligneVide()])
    setEtape('relecture')
  }

  async function enregistrer() {
    const aEnregistrer = lignes.filter((l) => l.parameter_label.trim() !== '')
    if (aEnregistrer.length === 0) {
      setError('Ajoutez au moins un paramètre avant d’enregistrer.')
      return
    }
    setError(null)
    setBusy(true)

    const importBatch = crypto.randomUUID()
    const lignesDb: Omit<LabValue, 'id'>[] = aEnregistrer.map((l) => {
      const { value, value_text } = parseValeur(l.valeur)
      return {
        dog_id: dogId,
        date,
        lab_name: labName.trim() || null,
        parameter_key: l.parameter_key.trim() || slugify(l.parameter_label),
        parameter_label: l.parameter_label.trim(),
        category: l.category,
        value,
        value_text,
        unit: l.unit?.trim() || null,
        ref_low: l.ref_low,
        ref_high: l.ref_high,
        flag: calculerFlag(value, l.ref_low, l.ref_high),
        note: null,
        import_batch: importBatch,
      }
    })

    const { error: dbError } = await supabase.from('lab_values').insert(lignesDb)
    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    if (storagePath) void nettoyerPhoto(storagePath)
    onSaved()
  }

  return (
    <Sheet title="Ajouter une analyse" onClose={() => void fermer()}>
      {etape === 'photo' && (
        <form onSubmit={analyser} className="space-y-4">
          <p className="text-sm text-slate-600">
            Prenez une photo du tableau de résultats. L’app lit les paramètres et vous les propose
            à relire avant de les enregistrer.
          </p>
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
            Pour une lecture fiable : photo à la verticale (portrait), bonne luminosité, tableau
            net et bien cadré.
          </p>
          <Field label="Photo de l’analyse" hint="Prenez la photo ou choisissez-la dans votre galerie.">
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800"
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" className="w-full">
            Analyser la photo
          </Button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            ou
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={saisirManuellement}>
            Saisir les paramètres à la main
          </Button>
        </form>
      )}

      {etape === 'analyse' && (
        <p className="py-10 text-center text-sm text-slate-500">Lecture de l’analyse…</p>
      )}

      {etape === 'relecture' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {storagePath
              ? 'Vérifiez et corrigez les paramètres avant d’enregistrer : la photo n’est pas conservée, seules ces valeurs le seront.'
              : 'Ajoutez les paramètres à enregistrer.'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date du prélèvement">
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Laboratoire (optionnel)">
              <input
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <ErrorMessage>{error}</ErrorMessage>

          <div className="space-y-3">
            {lignes.map((ligne) => (
              <div key={ligne.cle} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={ligne.parameter_label}
                    onChange={(e) => modifierLigne(ligne.cle, { parameter_label: e.target.value })}
                    placeholder="Nom du paramètre"
                    className={`${inputClass} font-medium`}
                  />
                  <button
                    type="button"
                    onClick={() => supprimerLigne(ligne.cle)}
                    aria-label="Supprimer cette ligne"
                    className="shrink-0 rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    &times;
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ligne.valeur}
                    onChange={(e) => modifierLigne(ligne.cle, { valeur: e.target.value })}
                    placeholder="Valeur"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={ligne.unit ?? ''}
                    onChange={(e) => modifierLigne(ligne.cle, { unit: e.target.value || null })}
                    placeholder="Unité"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    step="any"
                    value={ligne.ref_low ?? ''}
                    onChange={(e) =>
                      modifierLigne(ligne.cle, {
                        ref_low: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Réf. min"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    step="any"
                    value={ligne.ref_high ?? ''}
                    onChange={(e) =>
                      modifierLigne(ligne.cle, {
                        ref_high: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Réf. max"
                    className={inputClass}
                  />
                </div>
                <select
                  value={ligne.category ?? ''}
                  onChange={(e) => modifierLigne(ligne.cle, { category: e.target.value || null })}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Catégorie…</option>
                  {Object.entries(CATEGORIE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <Button type="button" variant="secondary" className="w-full" onClick={ajouterLigne}>
            + Ajouter une ligne
          </Button>

          <Button type="button" disabled={busy} className="w-full" onClick={() => void enregistrer()}>
            {busy ? 'Enregistrement…' : `Enregistrer ${lignes.length > 0 ? `(${lignes.length})` : ''}`}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
