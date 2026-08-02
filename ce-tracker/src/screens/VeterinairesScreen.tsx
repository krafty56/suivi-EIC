import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Veterinaire } from '../lib/types'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'

type Props = { dogId: string }

/** Carnet des cliniques/vétérinaires du chien : autant qu'on veut, chacun
 * avec un numéro qui appelle et un email qui écrit en un tap. */
export default function VeterinairesScreen({ dogId }: Props) {
  const [veterinaires, setVeterinaires] = useState<Veterinaire[] | null>(null)
  const [editing, setEditing] = useState<Veterinaire | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('veterinaires')
      .select('*')
      .eq('dog_id', dogId)
      .order('nom', { ascending: true })

    if (dbError) setError(dbError.message)
    else setVeterinaires(data as Veterinaire[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function remove(veterinaire: Veterinaire) {
    if (!confirm(`Supprimer ${veterinaire.nom} ?`)) return
    const { error: dbError } = await supabase.from('veterinaires').delete().eq('id', veterinaire.id)
    if (dbError) setError(dbError.message)
    else void load()
  }

  if (veterinaires === null) return <Spinner />

  return (
    <div className="space-y-3 p-4">
      <ErrorMessage>{error}</ErrorMessage>

      {veterinaires.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun vétérinaire enregistré pour l’instant.</p>
        </Card>
      )}

      {veterinaires.map((veterinaire) => (
        <Card key={veterinaire.id}>
          <p className="font-semibold text-slate-900">{veterinaire.nom}</p>

          <div className="mt-2 space-y-1.5">
            {veterinaire.telephone && (
              <a
                href={`tel:${veterinaire.telephone.replace(/\s+/g, '')}`}
                className="flex items-center gap-2 text-sm font-medium text-brand-700"
              >
                <span aria-hidden="true">📞</span>
                <span>{veterinaire.telephone}</span>
              </a>
            )}
            {veterinaire.email && (
              <a
                href={`mailto:${veterinaire.email}`}
                className="flex items-center gap-2 text-sm font-medium text-brand-700"
              >
                <span aria-hidden="true">✉️</span>
                <span className="truncate">{veterinaire.email}</span>
              </a>
            )}
            {!veterinaire.telephone && !veterinaire.email && (
              <p className="text-sm text-slate-500">Aucun contact renseigné.</p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 py-2 text-sm"
              onClick={() => setEditing(veterinaire)}
            >
              Modifier
            </Button>
            <Button
              type="button"
              variant="danger"
              className="py-2 text-sm"
              onClick={() => void remove(veterinaire)}
            >
              Supprimer
            </Button>
          </div>
        </Card>
      ))}

      <Button type="button" className="w-full" onClick={() => setEditing('new')}>
        Ajouter un vétérinaire
      </Button>

      {editing && (
        <VeterinaireSheet
          dogId={dogId}
          veterinaire={editing === 'new' ? null : editing}
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

function VeterinaireSheet({
  dogId,
  veterinaire,
  onClose,
  onSaved,
}: {
  dogId: string
  veterinaire: Veterinaire | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nom, setNom] = useState(veterinaire?.nom ?? '')
  const [telephone, setTelephone] = useState(veterinaire?.telephone ?? '')
  const [email, setEmail] = useState(veterinaire?.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!nom.trim()) {
      setError('Le nom de la clinique est obligatoire.')
      return
    }
    setError(null)
    setBusy(true)

    const payload = {
      dog_id: dogId,
      nom: nom.trim(),
      telephone: telephone.trim() || null,
      email: email.trim() || null,
    }

    const { error: dbError } = veterinaire
      ? await supabase.from('veterinaires').update(payload).eq('id', veterinaire.id)
      : await supabase.from('veterinaires').insert(payload)

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title={veterinaire ? 'Modifier le vétérinaire' : 'Ajouter un vétérinaire'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nom de la clinique">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className={inputClass}
            required
            autoFocus
          />
        </Field>

        <Field label="Téléphone">
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className={inputClass}
            placeholder="06 12 34 56 78"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="contact@clinique-veterinaire.fr"
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
