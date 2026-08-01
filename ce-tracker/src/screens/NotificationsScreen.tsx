import { useEffect, useState } from 'react'
import type { Dog } from '../lib/types'
import { abonnementActuel, activer, desactiver, estInstallee, pushDisponible } from '../lib/push'
import { Button, Card, ErrorMessage } from '../components/ui'

type Props = { dog: Dog }

export default function NotificationsScreen({ dog }: Props) {
  const [abonne, setAbonne] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void abonnementActuel().then((sub) => setAbonne(!!sub))
  }, [])

  async function handleActiver() {
    setBusy(true)
    setError(null)
    try {
      await activer(dog.id)
      setAbonne(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’activer les notifications.')
    }
    setBusy(false)
  }

  async function handleDesactiver() {
    setBusy(true)
    setError(null)
    try {
      await desactiver()
      setAbonne(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de désactiver les notifications.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <p className="text-sm text-slate-600">
          Un rappel la veille d’un rendez-vous noté dans l’agenda, et un rappel à l’heure
          programmée pour chaque médicament actif.
        </p>
      </Card>

      {!estInstallee() ? (
        <Card>
          <p className="text-sm font-medium text-slate-700">Installez d’abord l’application</p>
          <p className="mt-1 text-sm text-slate-600">
            Sur iPhone : bouton Partager, puis « Sur l’écran d’accueil ». Les notifications ne
            fonctionnent que depuis l’application installée, pas depuis Safari seul.
          </p>
        </Card>
      ) : !pushDisponible() ? (
        <Card>
          <p className="text-sm text-slate-600">
            Les notifications ne sont pas prises en charge sur cet appareil ou ce navigateur.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-700">
            {abonne ? 'Notifications activées' : 'Notifications désactivées'}
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          <Button
            type="button"
            variant={abonne ? 'secondary' : 'primary'}
            disabled={busy || abonne === null}
            className="w-full"
            onClick={() => void (abonne ? handleDesactiver() : handleActiver())}
          >
            {busy ? 'Un instant…' : abonne ? 'Désactiver' : 'Activer les notifications'}
          </Button>
        </Card>
      )}
    </div>
  )
}
