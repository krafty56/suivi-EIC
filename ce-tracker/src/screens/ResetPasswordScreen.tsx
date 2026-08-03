import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorMessage, Field, inputClass } from '../components/ui'
import Logo from '../components/Logo'

/** Affiché à l'arrivée depuis le lien reçu par email (mot de passe oublié) :
 * Supabase ouvre déjà une session à ce stade, il ne reste qu'à choisir le
 * nouveau mot de passe avant de laisser entrer dans l'app normalement. */
export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setBusy(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (authError) {
      setError(authError.message)
      return
    }
    onDone()
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center overflow-y-auto px-5 py-10">
      <Logo taille={38} baseline />
      <p className="mt-4 text-sm text-slate-600">Choisissez un nouveau mot de passe.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Field label="Nouveau mot de passe">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Confirmer le mot de passe">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Un instant…' : 'Valider le nouveau mot de passe'}
        </Button>
      </form>
    </div>
  )
}
