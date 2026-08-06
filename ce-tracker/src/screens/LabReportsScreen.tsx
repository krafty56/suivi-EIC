import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LabReport, LabReportFolder } from '../lib/types'
import { formatLongDate, todayISO } from '../lib/date'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { LAB_BUCKET, estPdf, labPhotoUrl } from '../lib/storage'

type Props = { dogId: string }

const SANS_DOSSIER = '__sans_dossier__'
const NOUVEAU_DOSSIER = '__nouveau__'

export default function LabReportsScreen({ dogId }: Props) {
  const [reports, setReports] = useState<LabReport[] | null>(null)
  const [folders, setFolders] = useState<LabReportFolder[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<LabReport | null>(null)
  const [folderSheet, setFolderSheet] = useState<'new' | LabReportFolder | null>(null)
  const [zoomed, setZoomed] = useState<LabReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [reportsResult, foldersResult] = await Promise.all([
      supabase.from('lab_reports').select('*').eq('dog_id', dogId).order('date', { ascending: false }),
      supabase.from('lab_report_folders').select('*').eq('dog_id', dogId).order('nom'),
    ])

    if (reportsResult.error) setError(reportsResult.error.message)
    else setReports(reportsResult.data as LabReport[])

    // Fail-soft : une table pas encore migrée ne doit pas bloquer l'écran.
    setFolders(foldersResult.error ? [] : (foldersResult.data as LabReportFolder[]))
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function remove(report: LabReport) {
    if (!confirm(`Supprimer ce compte rendu${report.storage_path ? ' et son fichier' : ''} ?`)) return

    if (report.storage_path) {
      const { data: removed, error: storageError } = await supabase.storage
        .from(LAB_BUCKET)
        .remove([report.storage_path])

      if (storageError) {
        setError(storageError.message)
        return
      }
      // Storage renvoie la liste des objets réellement supprimés : une liste vide
      // n'est pas une erreur pour l'API, mais le fichier est toujours en ligne. On
      // s'arrête là plutôt que d'effacer la ligne et de laisser un fichier orphelin.
      if (!removed || removed.length === 0) {
        setError('Le fichier n’a pas pu être supprimé. Le compte rendu est conservé.')
        return
      }
    }

    const { error: dbError } = await supabase.from('lab_reports').delete().eq('id', report.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  async function removeFolder(folder: LabReportFolder) {
    if (
      !confirm(
        `Supprimer le dossier « ${folder.nom} » ? Les comptes rendus qu'il contient ne seront pas supprimés, seulement déplacés hors dossier.`,
      )
    )
      return

    const { error: dbError } = await supabase.from('lab_report_folders').delete().eq('id', folder.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (reports === null || folders === null) return <Spinner />

  const groupes: { folder: LabReportFolder | null; items: LabReport[] }[] = [
    ...folders.map((folder) => ({
      folder,
      items: reports.filter((r) => r.folder_id === folder.id),
    })),
    { folder: null, items: reports.filter((r) => r.folder_id === null) },
  ]

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Importez les comptes rendus de laboratoire (PDF ou photo) pour les garder avec le suivi.
        Ils apparaissent dans le dossier partagé avec le vétérinaire.
      </p>
      <p className="text-xs text-slate-500">
        Un PDF reste net et zoomable, contrairement à une photo. Depuis le sélecteur de fichier,
        vous pouvez aussi choisir un document depuis OneDrive ou Google Drive s'ils sont installés
        sur votre téléphone. Renommez chaque compte rendu et rangez-le dans un dossier pour vous y
        retrouver.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {reports.length === 0 && folders.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun compte rendu enregistré.</p>
        </Card>
      )}

      {groupes.map(({ folder, items }) => {
        if (!folder && items.length === 0) return null
        return (
          <div key={folder?.id ?? 'sans-dossier'} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-sm font-semibold text-slate-700">{folder ? folder.nom : 'Sans dossier'}</p>
              {folder && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setFolderSheet(folder)}
                    className="text-xs font-medium text-brand-700"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeFolder(folder)}
                    className="text-xs font-medium text-red-600"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-400 italic">Dossier vide.</p>
              </Card>
            ) : (
              items.map((report) => (
                <Card key={report.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
                      {report.titre || formatLongDate(report.date)}
                    </p>
                    {report.lab_name && (
                      <p className="shrink-0 text-xs text-slate-500">{report.lab_name}</p>
                    )}
                  </div>
                  {report.titre && (
                    <p className="text-xs text-slate-500 first-letter:uppercase">
                      {formatLongDate(report.date)}
                    </p>
                  )}
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
                        <span className="text-sm font-medium text-brand-800">
                          Ouvrir le compte rendu
                        </span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setZoomed(report)}
                        className="mt-3 block w-full"
                      >
                        <img
                          src={labPhotoUrl(report.storage_path)}
                          alt={report.titre || `Compte rendu du ${report.date}`}
                          loading="lazy"
                          className="max-h-64 w-full rounded-xl object-cover ring-1 ring-slate-200"
                        />
                      </button>
                    )
                  ) : (
                    !report.note && (
                      <p className="mt-1 text-sm text-slate-400 italic">Aucun fichier, aucune note.</p>
                    )
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 py-2 text-sm"
                      onClick={() => setEditing(report)}
                    >
                      Modifier
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="flex-1 py-2 text-sm"
                      onClick={() => void remove(report)}
                    >
                      Supprimer
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )
      })}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={() => setFolderSheet('new')}>
          Nouveau dossier
        </Button>
        <Button type="button" className="flex-1" onClick={() => setAdding(true)}>
          Ajouter un compte rendu
        </Button>
      </div>

      {(adding || editing) && (
        <LabReportSheet
          dogId={dogId}
          folders={folders}
          report={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={() => {
            setAdding(false)
            setEditing(null)
            void load()
          }}
        />
      )}

      {folderSheet && (
        <FolderSheet
          dogId={dogId}
          folder={folderSheet === 'new' ? null : folderSheet}
          onClose={() => setFolderSheet(null)}
          onSaved={() => {
            setFolderSheet(null)
            void load()
          }}
        />
      )}

      {zoomed && zoomed.storage_path && (
        <Sheet title={zoomed.titre || formatLongDate(zoomed.date)} onClose={() => setZoomed(null)}>
          <img
            src={labPhotoUrl(zoomed.storage_path)}
            alt={zoomed.titre || `Compte rendu du ${zoomed.date}`}
            className="w-full rounded-xl"
          />
          {zoomed.note && <p className="mt-3 text-sm text-slate-600">{zoomed.note}</p>}
        </Sheet>
      )}
    </div>
  )
}

function FolderSheet({
  dogId,
  folder,
  onClose,
  onSaved,
}: {
  dogId: string
  folder: LabReportFolder | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nom, setNom] = useState(folder?.nom ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!nom.trim()) {
      setError('Donnez un nom au dossier.')
      return
    }
    setError(null)
    setBusy(true)

    const { error: dbError } = folder
      ? await supabase.from('lab_report_folders').update({ nom: nom.trim() }).eq('id', folder.id)
      : await supabase.from('lab_report_folders').insert({ dog_id: dogId, nom: nom.trim() })

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={folder ? 'Renommer le dossier' : 'Nouveau dossier'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nom du dossier" hint="Par exemple : médecine interne, imagerie, chirurgie…">
          <input
            type="text"
            required
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
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

function LabReportSheet({
  dogId,
  folders,
  report,
  onClose,
  onSaved,
}: {
  dogId: string
  folders: LabReportFolder[]
  report: LabReport | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(report?.date ?? todayISO())
  const [titre, setTitre] = useState(report?.titre ?? '')
  const [folderChoice, setFolderChoice] = useState(report?.folder_id ?? SANS_DOSSIER)
  const [nouveauDossierNom, setNouveauDossierNom] = useState('')
  const [note, setNote] = useState(report?.note ?? '')
  const [albumine, setAlbumine] = useState(report?.albumine != null ? String(report.albumine) : '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!report && !file) {
      setError('Choisissez un document ou une photo du compte rendu.')
      return
    }
    if (folderChoice === NOUVEAU_DOSSIER && !nouveauDossierNom.trim()) {
      setError('Donnez un nom au nouveau dossier.')
      return
    }
    setError(null)
    setBusy(true)

    let folderId: string | null = folderChoice === SANS_DOSSIER ? null : folderChoice

    if (folderChoice === NOUVEAU_DOSSIER) {
      const { data: nouveauDossier, error: folderError } = await supabase
        .from('lab_report_folders')
        .insert({ dog_id: dogId, nom: nouveauDossierNom.trim() })
        .select()
        .single()

      if (folderError) {
        setBusy(false)
        setError(folderError.message)
        return
      }
      folderId = nouveauDossier.id as string
    }

    let storagePath = report?.storage_path ?? null
    const ancienStoragePath = report?.storage_path ?? null

    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      storagePath = `${dogId}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(LAB_BUCKET)
        .upload(storagePath, file, { contentType: file.type || undefined })

      if (uploadError) {
        setBusy(false)
        setError(uploadError.message)
        return
      }
    }

    const payload = {
      dog_id: dogId,
      date,
      titre: titre.trim() || null,
      folder_id: folderId,
      storage_path: storagePath,
      note: note.trim() || null,
      albumine: albumine.trim() === '' ? null : Number(albumine.replace(',', '.')),
    }

    const { error: dbError } = report
      ? await supabase.from('lab_reports').update(payload).eq('id', report.id)
      : await supabase.from('lab_reports').insert(payload)

    if (dbError) {
      setBusy(false)
      // La ligne n'a pas pu être créée/mise à jour : on ne laisse pas un
      // nouveau fichier orphelin si on venait d'en uploader un.
      if (file && storagePath) await supabase.storage.from(LAB_BUCKET).remove([storagePath])
      setError(dbError.message)
      return
    }

    // Remplacement réussi : l'ancien fichier n'est plus référencé, on le retire.
    if (file && ancienStoragePath && ancienStoragePath !== storagePath) {
      await supabase.storage.from(LAB_BUCKET).remove([ancienStoragePath])
    }

    setBusy(false)
    onSaved()
  }

  return (
    <Sheet title={report ? 'Modifier le compte rendu' : 'Ajouter un compte rendu'} onClose={onClose}>
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

        <Field label="Titre" hint="Facultatif. Pour retrouver le document plus facilement, ex. « Bilan sanguin post-crise ».">
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Dossier">
          <select
            value={folderChoice}
            onChange={(e) => setFolderChoice(e.target.value)}
            className={inputClass}
          >
            <option value={SANS_DOSSIER}>Sans dossier</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
            <option value={NOUVEAU_DOSSIER}>+ Nouveau dossier…</option>
          </select>
        </Field>

        {folderChoice === NOUVEAU_DOSSIER && (
          <Field label="Nom du nouveau dossier">
            <input
              type="text"
              autoFocus
              value={nouveauDossierNom}
              onChange={(e) => setNouveauDossierNom(e.target.value)}
              className={inputClass}
              placeholder="Médecine interne, imagerie…"
            />
          </Field>
        )}

        <Field
          label="Document"
          hint={
            report?.storage_path
              ? "Facultatif : choisissez un fichier pour remplacer l'actuel. PDF ou photo. Le sélecteur propose aussi vos fichiers OneDrive ou Google Drive si ces apps sont installées."
              : 'PDF (recommandé, plus net) ou photo. Le sélecteur propose aussi vos fichiers OneDrive ou Google Drive si ces apps sont installées.'
          }
        >
          <input
            type="file"
            accept="application/pdf,image/*"
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
