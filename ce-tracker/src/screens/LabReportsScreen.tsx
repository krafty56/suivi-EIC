import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LabReport } from '../lib/types'
import { formatLongDate, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { LAB_BUCKET, labPhotoUrl } from '../lib/storage'

type Props = { dogId: string }

/** PDF plutôt que photo : le chemin de stockage se termine en .pdf. Un
 * compte rendu PDF s'affiche via un lien vers le lecteur natif (crisp, zoomable)
 * plutôt qu'une balise img, illisible pour un document texte. */
function estPdf(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith('.pdf')
}

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
    if (!confirm(`Supprimer ce compte rendu${report.storage_path ? ' et sa photo' : ''} ?`)) return

    if (report.storage_path) {
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
    }

    const { error: dbError } = await supabase.from('lab_reports').delete().eq('id', report.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (reports === null) return <Spinner />

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Importez les comptes rendus de laboratoire (PDF ou photo) pour les garder avec le suivi.
        Ils apparaissent dans le dossier partagé avec le vétérinaire.
      </p>
      <p className="text-xs text-slate-500">
        Un PDF reste net et zoomable, contrairement à une photo. Depuis le sélecteur de fichier,
        vous pouvez aussi choisir un document depuis OneDrive ou Google Drive s'ils sont installés
        sur votre téléphone.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {reports.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun compte rendu enregistré.</p>
        </Card>
      )}

      {reports.map((report) => (
        <Card key={report.id}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
              {formatLongDate(report.date)}
            </p>
            {report.lab_name && (
              <p className="shrink-0 text-xs text-slate-500">{report.lab_name}</p>
            )}
          </div>
          {report.albumine !== null && (
            <p className="mt-1 text-sm font-medium text-slate-700 tabular-nums">
              Albuminémie {report.albumine} g/L
            </p>
          )}
          {report.note && <p className="mt-1 text-sm text-slate-600">{report.note}</p>}
          {report.storage_path ? (
            estPdf(report.storage_path) ? (
              <a
                href={labPhotoUrl(report.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-700">
                  PDF
                </span>
                <span className="text-sm font-medium text-brand-800">Ouvrir le compte rendu</span>
              </a>
            ) : (
              <button type="button" onClick={() => setZoomed(report)} className="mt-3 block w-full">
                <img
                  src={labPhotoUrl(report.storage_path)}
                  alt={`Compte rendu du ${report.date}`}
                  loading="lazy"
                  className="max-h-64 w-full rounded-xl object-cover ring-1 ring-slate-200"
                />
              </button>
            )
          ) : (
            !report.note && (
              <p className="mt-1 text-sm text-slate-400 italic">Aucune photo, aucune note.</p>
            )
          )}
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

      {zoomed && zoomed.storage_path && (
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
  const [albumine, setAlbumine] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choisissez un document ou une photo du compte rendu.')
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
      .insert({
        dog_id: dogId,
        date,
        storage_path: path,
        note: note.trim() || null,
        albumine: albumine.trim() === '' ? null : Number(albumine.replace(',', '.')),
      })

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

        <Field
          label="Document"
          hint="PDF (recommandé, plus net) ou photo. Le sélecteur propose aussi vos fichiers OneDrive ou Google Drive si ces apps sont installées."
        >
          <input
            type="file"
            accept="application/pdf,image/*"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800"
          />
        </Field>

        <Field
          label="Albuminémie (g/L)"
          hint="Facultatif. C’est le critère biologique du CCECAI : le renseigner ici évite d’avoir à relire la photo."
        >
          <input
            inputMode="decimal"
            value={albumine}
            onChange={(e) => setAlbumine(e.target.value)}
            className={inputClass}
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
