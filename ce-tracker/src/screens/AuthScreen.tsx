import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorMessage, Field, inputClass } from '../components/ui'
import Logo from '../components/Logo'

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)

    if (mode === 'forgot') {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      setBusy(false)
      if (authError) {
        setError(authError.message)
        return
      }
      setInfo('Email envoyé si un compte existe avec cette adresse. Suivez le lien reçu pour choisir un nouveau mot de passe.')
      return
    }

    const { error: authError, data } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setBusy(false)

    if (authError) {
      setError(authError.message)
      return
    }
    // Si la confirmation par email est activée, aucune session n'est ouverte tout de suite.
    if (mode === 'signup' && !data.session) {
      setInfo('Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.')
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center overflow-y-auto px-5 py-10">
      <Logo taille={38} baseline />
      <p className="mt-4 text-sm text-slate-600">
        Le carnet de bord quotidien de votre chien.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>

        {mode !== 'forgot' && (
          <Field label="Mot de passe">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot')
              setError(null)
              setInfo(null)
            }}
            className="text-sm font-medium text-brand-700 underline"
          >
            Mot de passe oublié ?
          </button>
        )}

        <ErrorMessage>{error}</ErrorMessage>
        {info && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-100">
            {info}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy
            ? 'Un instant…'
            : mode === 'signin'
              ? 'Se connecter'
              : mode === 'signup'
                ? 'Créer mon compte'
                : 'Envoyer le lien'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup')
          setError(null)
          setInfo(null)
        }}
        className="mt-6 text-sm font-medium text-brand-700 underline"
      >
        {mode === 'signup'
          ? 'J’ai déjà un compte'
          : mode === 'forgot'
            ? 'Retour à la connexion'
            : 'Pas encore de compte ? Créer un compte'}
      </button>
    </div>
  )
}
