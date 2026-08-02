import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Dog } from './lib/types'
import AccueilScreen from './screens/AccueilScreen'
import AgendaScreen from './screens/AgendaScreen'
import AuthScreen from './screens/AuthScreen'
import DogFormScreen from './screens/DogFormScreen'
import DogHubScreen from './screens/DogHubScreen'
import SaisirHubScreen from './screens/SaisirHubScreen'
import ExportPdfScreen from './screens/ExportPdfScreen'
import HistoryHubScreen from './screens/HistoryHubScreen'
import LabHubScreen from './screens/LabHubScreen'
import SharedDossierScreen from './screens/SharedDossierScreen'
import { ErrorMessage, Spinner } from './components/ui'
import {
  IconAccueil,
  IconAgenda,
  IconAnalyses,
  IconChien,
  IconHistorique,
  IconLabo,
  IconSaisie,
} from './components/icons'

type Tab = 'home' | 'daily' | 'history' | 'analyses' | 'labs' | 'agenda' | 'dog'

const TABS: {
  id: Tab
  label: string
  title: string
  Icon: (props: { className?: string }) => React.ReactElement
}[] = [
  { id: 'home', label: 'Accueil', title: 'Aujourd’hui', Icon: IconAccueil },
  { id: 'daily', label: 'Saisir', title: 'Saisir', Icon: IconSaisie },
  { id: 'history', label: 'Historique', title: 'Historique', Icon: IconHistorique },
  { id: 'analyses', label: 'Analyses', title: 'Analyses', Icon: IconAnalyses },
  { id: 'labs', label: 'Labo', title: 'Labo', Icon: IconLabo },
  { id: 'agenda', label: 'Agenda', title: 'Agenda', Icon: IconAgenda },
  { id: 'dog', label: 'Chien', title: 'Le chien', Icon: IconChien },
]

/** Le lien vétérinaire est une URL du type /?share=<jeton>, lue avant toute authentification. */
const shareToken = new URLSearchParams(window.location.search).get('share')

// Recharts pèse à lui seul plus que tout le reste de l'application. On le charge
// seulement quand les analyses sont ouvertes, pour que la saisie quotidienne reste rapide.
const AnalysesScreen = lazy(() => import('./screens/AnalysesScreen'))

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dog, setDog] = useState<Dog | null>(null)
  const [dogLoaded, setDogLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [exportOuvert, setExportOuvert] = useState(false)

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

  // Rendu hors coquille (pas de hauteur fixe, pas de scroll interne) : sinon
  // window.print() ne sort que la portion actuellement visible à l'écran.
  if (exportOuvert) return <ExportPdfScreen dog={dog} onClose={() => setExportOuvert(false)} />

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
        {tab === 'home' && <AccueilScreen dog={dog} />}
        {tab === 'daily' && <SaisirHubScreen dog={dog} onDogChange={setDog} />}
        {tab === 'history' && <HistoryHubScreen dog={dog} onExport={() => setExportOuvert(true)} />}
        {tab === 'analyses' && (
          <Suspense fallback={<Spinner label="Chargement des analyses…" />}>
            <AnalysesScreen dogId={dog.id} />
          </Suspense>
        )}
        {tab === 'labs' && <LabHubScreen dogId={dog.id} />}
        {tab === 'agenda' && <AgendaScreen dogId={dog.id} />}
        {tab === 'dog' && <DogHubScreen dog={dog} ownerId={session.user.id} onSaved={setDog} />}
      </main>

      <nav className="grid shrink-0 grid-cols-7 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
              tab === item.id ? 'text-slate-900' : 'text-slate-500'
            }`}
          >
            {/* La sauge marque l'onglet courant en pastille plutôt qu'en couleur de
                texte : sur blanc elle ne contraste qu'à 1,7:1, illisible à 11 px. */}
            <span
              className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                tab === item.id ? 'bg-brand-50' : ''
              }`}
            >
              <item.Icon />
            </span>
            <span className="max-w-full px-0.5 text-center leading-tight break-words">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
