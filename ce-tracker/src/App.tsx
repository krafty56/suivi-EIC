import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Dog } from './lib/types'
import AuthScreen from './screens/AuthScreen'
import DogFormScreen from './screens/DogFormScreen'
import DogHubScreen from './screens/DogHubScreen'
import DailyEntryScreen from './screens/DailyEntryScreen'
import HistoryScreen from './screens/HistoryScreen'
import LabReportsScreen from './screens/LabReportsScreen'
import SharedDossierScreen from './screens/SharedDossierScreen'
import { ErrorMessage, Spinner } from './components/ui'

type Tab = 'daily' | 'history' | 'timeline' | 'labs' | 'dog'

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'daily', label: 'Saisie', title: 'Saisie quotidienne' },
  { id: 'history', label: 'Historique', title: 'Historique' },
  { id: 'timeline', label: 'Frise', title: 'Frise temporelle' },
  { id: 'labs', label: 'Labo', title: 'Comptes rendus' },
  { id: 'dog', label: 'Chien', title: 'Le chien' },
]

/** Le lien vétérinaire est une URL du type /?share=<jeton>, lue avant toute authentification. */
const shareToken = new URLSearchParams(window.location.search).get('share')

// Recharts pèse à lui seul plus que tout le reste de l'application. On le charge
// seulement quand la frise est ouverte, pour que la saisie quotidienne reste rapide.
const TimelineScreen = lazy(() => import('./screens/TimelineScreen'))

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dog, setDog] = useState<Dog | null>(null)
  const [dogLoaded, setDogLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('daily')

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setDog(null)
      setDogLoaded(false)
      return
    }

    async function loadDog() {
      const { data, error: dbError } = await supabase
        .from('dogs')
        .select('*')
        .eq('owner_id', session!.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (dbError) setError(dbError.message)
      else setDog(data as Dog | null)
      setDogLoaded(true)
    }

    void loadDog()
  }, [session])

  // Le vétérinaire ouvre le dossier sans compte : ce cas court-circuite tout le reste.
  if (shareToken) return <SharedDossierScreen token={shareToken} />

  if (!authReady) return <Spinner />
  if (!session) return <AuthScreen />
  if (!dogLoaded) return <Spinner />

  // Sans fiche chien, rien d'autre n'a de sens : on la demande avant tout le reste.
  if (!dog) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Fiche du chien</h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ErrorMessage>{error}</ErrorMessage>
          <DogFormScreen dog={null} ownerId={session.user.id} onSaved={setDog} />
        </div>
      </div>
    )
  }

  const currentTab = TABS.find((item) => item.id === tab)!

  return (
    // Coquille d'application : en-tête et barre d'onglets fixes, seul le contenu défile.
    // La barre d'action collante de la saisie quotidienne se cale ainsi au-dessus des onglets.
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">{currentTab.title}</h1>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Déconnexion
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === 'daily' && <DailyEntryScreen dogId={dog.id} dogName={dog.name} />}
        {tab === 'history' && <HistoryScreen dogId={dog.id} />}
        {tab === 'timeline' && (
          <Suspense fallback={<Spinner label="Chargement de la frise…" />}>
            <TimelineScreen dogId={dog.id} />
          </Suspense>
        )}
        {tab === 'labs' && <LabReportsScreen dogId={dog.id} />}
        {tab === 'dog' && <DogHubScreen dog={dog} ownerId={session.user.id} onSaved={setDog} />}
      </main>

      <nav className="grid shrink-0 grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className={`py-3 text-xs font-semibold transition-colors ${
              tab === item.id ? 'text-brand-700' : 'text-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
