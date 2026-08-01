import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorMessage, Field, inputClass } from '../components/ui'

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
      <h1 className="text-2xl font-bold text-slate-900">Suivi EIC</h1>
      <p className="mt-1 text-sm text-slate-600">
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

        <ErrorMessage>{error}</ErrorMessage>
        {info && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-100">
            {info}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
        className="mt-6 text-sm font-medium text-brand-700 underline"
      >
        {mode === 'signin' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte'}
      </button>
    </div>
  )
}
