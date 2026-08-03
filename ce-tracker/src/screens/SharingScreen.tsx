import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { VetShare } from '../lib/types'
import { formatLongDate } from '../lib/date'
import { usePremium } from '../lib/premium'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import { Verrou } from '../components/Verrou'

export function shareUrl(token: string): string {
  return `${window.location.origin}/?share=${token}`
}

type Props = { dogId: string }

export default function SharingScreen({ dogId }: Props) {
  const { isPremium } = usePremium()
  const [shares, setShares] = useState<VetShare[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [verrouOuvert, setVerrouOuvert] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('vet_shares')
      .select('*')
      .eq('dog_id', dogId)
      .order('created_at', { ascending: false })

    if (dbError) setError(dbError.message)
    else setShares(data as VetShare[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  async function revoke(share: VetShare) {
    if (!confirm('Révoquer ce lien ? Le vétérinaire n’aura plus accès au dossier.')) return
    const { error: dbError } = await supabase
      .from('vet_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', share.id)

    if (dbError) setError(dbError.message)
    else void load()
  }

  async function copy(share: VetShare) {
    try {
      await navigator.clipboard.writeText(shareUrl(share.token))
      setCopied(share.id)
      setTimeout(() => setCopied(null), 2500)
    } catch {
      setError('Copie impossible. Sélectionnez le lien affiché et copiez-le à la main.')
    }
  }

  if (shares === null) return <Spinner />

  const etat = (share: VetShare) => {
    if (share.revoked_at) return { label: 'Révoqué', actif: false }
    if (new Date(share.expires_at) < new Date()) return { label: 'Expiré', actif: false }
    return { label: `Valable jusqu’au ${formatLongDate(share.expires_at.slice(0, 10))}`, actif: true }
  }

  const actifs = shares.filter((s) => etat(s).actif).length
  const limiteAtteinte = !isPremium && actifs >= 1

  function ouvrirCreation() {
    if (limiteAtteinte) setVerrouOuvert(true)
    else setCreating(true)
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Le lien donne un accès en lecture seule au dossier : fiche, traitement, saisies
        quotidiennes, crises et comptes rendus. Le vétérinaire n’a pas de compte à créer et ne
        peut rien modifier.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {shares.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun lien de partage créé.</p>
        </Card>
      )}

      {shares.map((share) => {
        const { label, actif } = etat(share)
        return (
          <Card key={share.id} className={actif ? '' : 'opacity-60'}>
            <p className="font-semibold text-slate-900">
              {share.clinic_email ?? 'Clinique non précisée'}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">{label}</p>

            {actif && (
              <>
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs break-all text-slate-600">
                  {shareUrl(share.token)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 py-2 text-sm"
                    onClick={() => void copy(share)}
                  >
                    {copied === share.id ? 'Lien copié' : 'Copier le lien'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="py-2 text-sm"
                    onClick={() => void revoke(share)}
                  >
                    Révoquer
                  </Button>
                </div>
              </>
            )}
          </Card>
        )
      })}

      <Button type="button" className="w-full" onClick={ouvrirCreation}>
        {limiteAtteinte ? '🔒 ' : ''}Créer un lien de partage
      </Button>

      {creating && (
        <ShareSheet
          dogId={dogId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void load()
          }}
        />
      )}

      {verrouOuvert && (
        <Sheet title="Plusieurs vétérinaires" onClose={() => setVerrouOuvert(false)}>
          <Verrou
            titre="Plusieurs liens actifs"
            description="Un lien de partage actif est inclus gratuitement. Passez premium pour partager le dossier avec plusieurs cliniques en même temps."
          />
        </Sheet>
      )}
    </div>
  )
}

function ShareSheet({
  dogId,
  onClose,
  onSaved,
}: {
  dogId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const { error: dbError } = await supabase
      .from('vet_shares')
      .insert({ dog_id: dogId, clinic_email: email.trim() || null })

    setBusy(false)
    if (dbError) setError(dbError.message)
    else onSaved()
  }

  return (
    <Sheet title="Créer un lien de partage" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email de la clinique"
          hint="Sert à identifier le destinataire dans cette liste. L’application n’envoie pas l’email : vous transmettrez le lien vous-même."
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="contact@clinique.fr"
          />
        </Field>

        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-100">
          Le lien sera valable 90 jours. Vous pouvez le révoquer à tout moment.
        </p>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Création…' : 'Créer le lien'}
        </Button>
      </form>
    </Sheet>
  )
}
