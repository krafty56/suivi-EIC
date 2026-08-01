import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LabReport } from '../lib/types'
import { formatLongDate, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { LAB_BUCKET, labPhotoUrl } from '../lib/storage'

type Props = { dogId: string }

export default function LabReportsScreen({ dogId }: Props) {
  const [reports, setReports] = useState<LabReport[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [zoomed, setZoomed] = useState<LabReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('lab_reports')
      .select('*')
      .eq('dog_id', dogId)
      .order('date', { ascending: false })

    if (dbError) setError(dbError.message)
    else setReports(data as LabReport[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function remove(report: LabReport) {
    if (!confirm('Supprimer ce compte rendu et sa photo ?')) return
    const { data: removed, error: storageError } = await supabase.storage
      .from(LAB_BUCKET)
      .remove([report.storage_path])

    if (storageError) {
      setError(storageError.message)
      return
    }
    // Storage renvoie la liste des objets réellement supprimés : une liste vide
    // n'est pas une erreur pour l'API, mais la photo est toujours en ligne. On
    // s'arrête là plutôt que d'effacer la ligne et de laisser un fichier orphelin.
    if (!removed || removed.length === 0) {
      setError('La photo n’a pas pu être supprimée. Le compte rendu est conservé.')
      return
    }
    const { error: dbError } = await supabase.from('lab_reports').delete().eq('id', report.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (reports === null) return <Spinner />

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Photographiez les comptes rendus de laboratoire pour les garder avec le suivi. Ils
        apparaissent dans le dossier partagé avec le vétérinaire.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {reports.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun compte rendu enregistré.</p>
        </Card>
      )}

      {reports.map((report) => (
        <Card key={report.id}>
          <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
            {formatLongDate(report.date)}
          </p>
          {report.note && <p className="mt-1 text-sm text-slate-600">{report.note}</p>}
          <button type="button" onClick={() => setZoomed(report)} className="mt-3 block w-full">
            <img
              src={labPhotoUrl(report.storage_path)}
              alt={`Compte rendu du ${report.date}`}
              loading="lazy"
              className="max-h-64 w-full rounded-xl object-cover ring-1 ring-slate-200"
            />
          </button>
          <Button
            type="button"
            variant="danger"
            className="mt-3 w-full py-2 text-sm"
            onClick={() => void remove(report)}
          >
            Supprimer
          </Button>
        </Card>
      ))}

      <Button type="button" className="w-full" onClick={() => setAdding(true)}>
        Ajouter un compte rendu
      </Button>

      {adding && (
        <LabReportSheet
          dogId={dogId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}

      {zoomed && (
        <Sheet title={formatLongDate(zoomed.date)} onClose={() => setZoomed(null)}>
          <img
            src={labPhotoUrl(zoomed.storage_path)}
            alt={`Compte rendu du ${zoomed.date}`}
            className="w-full rounded-xl"
          />
          {zoomed.note && <p className="mt-3 text-sm text-slate-600">{zoomed.note}</p>}
        </Sheet>
      )}
    </div>
  )
}

function LabReportSheet({
  dogId,
  onClose,
  onSaved,
}: {
  dogId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choisissez une photo du compte rendu.')
      return
    }
    setError(null)
    setBusy(true)

    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${dogId}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(LAB_BUCKET)
      .upload(path, file, { contentType: file.type || undefined })

    if (uploadError) {
      setBusy(false)
      setError(uploadError.message)
      return
    }

    const { error: dbError } = await supabase
      .from('lab_reports')
      .insert({ dog_id: dogId, date, storage_path: path, note: note.trim() || null })

    setBusy(false)
    if (dbError) {
      // La ligne n'a pas pu être créée : on ne laisse pas la photo orpheline.
      await supabase.storage.from(LAB_BUCKET).remove([path])
      setError(dbError.message)
      return
    }
    onSaved()
  }

  return (
    <Sheet title="Ajouter un compte rendu" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Date du compte rendu">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Photo" hint="Prenez la photo ou choisissez-la dans votre galerie.">
          <input
            type="file"
            accept="image/*"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800"
          />
        </Field>

        <Field label="Note">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optionnel : laboratoire, motif, points marquants…"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Envoi…' : 'Enregistrer'}
        </Button>
      </form>
    </Sheet>
  )
}
