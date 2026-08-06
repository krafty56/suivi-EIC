import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Appointment, Dog } from './lib/types'
import { VetModeContext } from './lib/vetMode'
import AccueilScreen from './screens/AccueilScreen'
import AgendaScreen from './screens/AgendaScreen'
import AuthScreen from './screens/AuthScreen'
import DogFormScreen from './screens/DogFormScreen'
import DogHubScreen from './screens/DogHubScreen'
import SaisirHubScreen from './screens/SaisirHubScreen'
import ExportPdfScreen from './screens/ExportPdfScreen'
import FichePreparationScreen from './screens/FichePreparationScreen'
import HistoryHubScreen from './screens/HistoryHubScreen'
import LabHubScreen from './screens/LabHubScreen'
import PremiumScreen from './screens/PremiumScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import { PremiumUpgradeProvider } from './lib/premiumUpgrade'
import { usePremium } from './lib/premium'
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
  { id: 'history', label: 'Journal', title: 'Journal', Icon: IconHistorique },
  { id: 'analyses', label: 'Analyses', title: 'Analyses', Icon: IconAnalyses },
  { id: 'labs', label: 'Labo', title: 'Labo', Icon: IconLabo },
  { id: 'agenda', label: 'Agenda', title: 'Agenda', Icon: IconAgenda },
  { id: 'dog', label: 'Chien', title: 'Le chien', Icon: IconChien },
]

/** Le lien vétérinaire est une URL du type /?share=<jeton>, lue avant toute authentification. */
const shareToken = new URLSearchParams(window.location.search).get('share')

/** Retour de Stripe Checkout (?premium=success|annule), lu une seule fois au
 * chargement puis retiré de l'URL pour ne pas réafficher le message au
 * moindre rafraîchissement. */
const premiumRedirect = new URLSearchParams(window.location.search).get('premium')
if (premiumRedirect) {
  const url = new URL(window.location.href)
  url.searchParams.delete('premium')
  window.history.replaceState({}, '', url)
}

// Recharts pèse à lui seul plus que tout le reste de l'application. On le charge
// seulement quand les analyses sont ouvertes, pour que la saisie quotidienne reste rapide.
const AnalysesScreen = lazy(() => import('./screens/AnalysesScreen'))

/** Statut d'abonnement, visible en permanence dans l'en-tête. À part plutôt
 * qu'appelé directement dans App : usePremium ne doit se monter qu'une fois
 * la session prête, sinon son unique fetch a lieu avant l'authentification
 * et ne se rejoue jamais.
 *
 * Cliquable dans les deux sens : ouvre le choix de formules si gratuit, ou
 * la gestion d'abonnement (portail Stripe, passage à l'offre à vie) si déjà
 * premium — PremiumScreen affiche la vue adaptée selon le statut. */
function PlanBadge({ onOuvrir }: { onOuvrir: () => void }) {
  const { isPremium, loading } = usePremium()
  if (loading) return null
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
        isPremium ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {isPremium ? '★ Premium' : 'Gratuit'}
    </button>
  )
}

/** Coquille commune au propriétaire et au vétérinaire : mêmes onglets, même
 * mise en page, même navigation. Ce qui change avec isVet est purement
 * l'habillage (onglet Saisir masqué, badge « lecture seule », pas de bouton
 * de déconnexion) — la vraie barrière contre l'écriture est côté RLS. */
function AppShell({
  dog,
  onDogChange,
  ownerId,
  isVet,
  onSignOut,
}: {
  dog: Dog
  onDogChange: (dog: Dog) => void
  ownerId: string
  isVet: boolean
  onSignOut: (() => void) | null
}) {
  const [tab, setTab] = useState<Tab>('home')
  const [exportOuvert, setExportOuvert] = useState(false)
  const [fichePrep, setFichePrep] = useState<Appointment | null>(null)
  const [premiumOuvert, setPremiumOuvert] = useState(false)
  const [messagePremium, setMessagePremium] = useState(premiumRedirect)

  // Rendu hors coquille (pas de hauteur fixe, pas de scroll interne) : sinon
  // window.print() ne sort que la portion actuellement visible à l'écran.
  if (exportOuvert) return <ExportPdfScreen dog={dog} onClose={() => setExportOuvert(false)} />
  if (fichePrep) {
    return <FichePreparationScreen dog={dog} appointment={fichePrep} onClose={() => setFichePrep(null)} />
  }

  // Rien à saisir en mode vétérinaire : l'onglet Saisir n'est qu'un hub de
  // formulaires de création, sans contenu propre à afficher en lecture seule.
  const tabsVisibles = isVet ? TABS.filter((item) => item.id !== 'daily') : TABS
  const currentTab = tabsVisibles.find((item) => item.id === tab) ?? tabsVisibles[0]

  // Le propriétaire reste sur la largeur téléphone (usage PWA mobile
  // établi) ; le vétérinaire, plus souvent sur ordinateur, reçoit une
  // colonne bien plus large qui utilise vraiment l'écran plutôt que de
  // flotter en colonne étroite au milieu d'un moniteur de bureau.
  const largeurShell = isVet ? 'w-full max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-6xl' : 'max-w-md'

  return (
    <PremiumUpgradeProvider ouvrir={() => setPremiumOuvert(true)}>
      <div className={`mx-auto flex h-full ${largeurShell} flex-col overflow-hidden bg-slate-50`}>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">
              {tab === 'dog' ? dog.name : currentTab.title}
            </h1>
          {isVet ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              👁 Lecture seule
            </span>
          ) : (
            <PlanBadge onOuvrir={() => setPremiumOuvert(true)} />
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* En PWA installée sur l'écran d'accueil, il n'y a ni barre
              d'adresse ni bouton de rechargement du navigateur : sans ça,
              impossible de forcer un rafraîchissement des données. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Actualiser"
            title="Actualiser"
            className="text-lg leading-none text-slate-500 hover:text-slate-800"
          >
            ⟳
          </button>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Déconnexion
            </button>
          )}
        </div>
      </header>

      {!isVet && messagePremium && (
        <button
          type="button"
          onClick={() => setMessagePremium(null)}
          className={`px-4 py-2 text-left text-sm font-medium ${
            messagePremium === 'success' ? 'bg-brand-50 text-brand-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {messagePremium === 'success'
            ? '✓ Merci ! Ton abonnement premium est activé.'
            : 'Paiement annulé — aucune somme prélevée.'}
        </button>
      )}

      <main className="flex-1 overflow-y-auto">
        {tab === 'home' && <AccueilScreen dog={dog} />}
        {tab === 'daily' && !isVet && <SaisirHubScreen dog={dog} onDogChange={onDogChange} />}
        {tab === 'history' && <HistoryHubScreen dog={dog} onExport={() => setExportOuvert(true)} />}
        {tab === 'analyses' && (
          <Suspense fallback={<Spinner label="Chargement des analyses…" />}>
            <AnalysesScreen dogId={dog.id} />
          </Suspense>
        )}
        {tab === 'labs' && <LabHubScreen dogId={dog.id} />}
        {tab === 'agenda' && (
          <AgendaScreen dogId={dog.id} dogName={dog.name} onPreparer={setFichePrep} />
        )}
        {tab === 'dog' && <DogHubScreen dog={dog} ownerId={ownerId} onSaved={onDogChange} />}
      </main>

      <nav className="grid shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${tabsVisibles.length}, minmax(0, 1fr))` }}
      >
        {tabsVisibles.map((item) => (
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

      {!isVet && premiumOuvert && <PremiumScreen onClose={() => setPremiumOuvert(false)} />}
      </div>
    </PremiumUpgradeProvider>
  )
}

type VetAccess =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dog: Dog }

/** Ouverture d'un lien vétérinaire : connexion anonyme (doit être activée
 * dans Authentication > Settings du projet Supabase), puis échange du
 * jeton contre un accès en lecture au chien concerné. */
function useVetAccess(token: string): VetAccess {
  const [state, setState] = useState<VetAccess>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        const { error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) {
          if (!cancelled) {
            setState({
              status: 'error',
              message:
                'Connexion impossible. Si le problème persiste, demandez un nouveau lien à la personne qui vous l’a transmis.',
            })
          }
          return
        }
      }

      const { data: dogId, error: redeemError } = await supabase.rpc('redeem_vet_share', {
        p_token: token,
      })
      if (redeemError || !dogId) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Ce lien est invalide, expiré ou a été révoqué par le propriétaire.',
          })
        }
        return
      }

      const { data: dog, error: dogError } = await supabase
        .from('dogs')
        .select('*')
        .eq('id', dogId as string)
        .single()

      if (cancelled) return
      if (dogError || !dog) {
        setState({ status: 'error', message: 'Le dossier n’a pas pu être chargé.' })
        return
      }
      setState({ status: 'ready', dog: dog as Dog })
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [token])

  return state
}

function VetApp({ token }: { token: string }) {
  const access = useVetAccess(token)
  const [dog, setDog] = useState<Dog | null>(null)

  useEffect(() => {
    if (access.status === 'ready') setDog(access.dog)
  }, [access])

  if (access.status === 'error') {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-bold text-slate-900">Accès impossible</p>
        <ErrorMessage>{access.message}</ErrorMessage>
      </div>
    )
  }
  if (access.status === 'loading' || !dog) return <Spinner label="Ouverture du dossier…" />

  return (
    <VetModeContext.Provider value={true}>
      <AppShell dog={dog} onDogChange={setDog} ownerId={dog.owner_id} isVet onSignOut={null} />
    </VetModeContext.Provider>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dog, setDog] = useState<Dog | null>(null)
  const [dogLoaded, setDogLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Le lien « mot de passe oublié » ouvre une session normalement, mais ce
  // n'est pas une vraie connexion : sans ce garde-fou, l'utilisateur passerait
  // directement dans l'app au lieu de choisir son nouveau mot de passe.
  const [recuperationMotDePasse, setRecuperationMotDePasse] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecuperationMotDePasse(true)
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
  if (shareToken) return <VetApp token={shareToken} />

  if (!authReady) return <Spinner />
  if (recuperationMotDePasse) {
    return <ResetPasswordScreen onDone={() => setRecuperationMotDePasse(false)} />
  }
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

  return (
    <VetModeContext.Provider value={false}>
      <AppShell
        dog={dog}
        onDogChange={setDog}
        ownerId={session.user.id}
        isVet={false}
        onSignOut={() => void supabase.auth.signOut()}
      />
    </VetModeContext.Provider>
  )
}
