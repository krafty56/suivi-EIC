import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ClinicalScore } from '../lib/types'
import { TOUS_LES_ITEMS } from '../data/scores'
import { formatLongDate } from '../lib/date'
import { useVetMode } from '../lib/vetMode'
import { Button, Card, ErrorMessage, Spinner } from '../components/ui'
import ScoreSheet from './ScoreSheet'

type Props = { dogId: string }

export default function ScoresScreen({ dogId }: Props) {
  const isVet = useVetMode()
  const [scores, setScores] = useState<ClinicalScore[] | null>(null)
  const [saisie, setSaisie] = useState(false)
  const [deplie, setDeplie] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: dbError } = await supabase
      .from('clinical_scores')
      .select('*')
      .eq('dog_id', dogId)
      .order('date', { ascending: false })
      .order('indice')

    if (dbError) setError(dbError.message)
    else setScores(data as ClinicalScore[])
  }

  useEffect(() => {
    void load()
  }, [dogId])

  if (scores === null) return <Spinner />

  // Une carte par date, les deux indices d'une même évaluation restant ensemble.
  const dates = [...new Set(scores.map((s) => s.date))]

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Le CIBDAI cote six critères cliniques sur 18. Le CCECAI y ajoute l’albuminémie,
        l’ascite et le prurit, sur 27. Ce sont des repères de suivi à interpréter avec votre
        vétérinaire, pas un diagnostic.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {dates.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucune évaluation enregistrée.</p>
        </Card>
      )}

      {dates.map((date) => {
        const dujour = scores.filter((s) => s.date === date)
        const ouvert = deplie === date
        return (
          <Card key={date}>
            <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
              {formatLongDate(date)}
            </p>

            <div className="mt-2 space-y-2">
              {dujour.map((score) => (
                <div key={score.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700 uppercase">
                    {score.indice}
                  </span>
                  <span className="text-right">
                    <span className="text-lg font-bold tabular-nums text-slate-900">
                      {score.total}
                      <span className="text-sm font-medium text-slate-500">
                        /{score.indice === 'cibdai' ? 18 : 27}
                      </span>
                    </span>
                    <span className="ml-2 text-sm text-slate-600">{score.severite}</span>
                  </span>
                </div>
              ))}
            </div>

            {dujour[0]?.note && (
              <p className="mt-2 text-sm text-slate-500 italic">{dujour[0].note}</p>
            )}

            <button
              type="button"
              onClick={() => setDeplie(ouvert ? null : date)}
              className="mt-3 text-sm font-medium text-brand-700 underline"
            >
              {ouvert ? 'Masquer le détail' : 'Voir le détail des critères'}
            </button>

            {ouvert && (
              <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                {TOUS_LES_ITEMS.map((item) => {
                  // Le CCECAI porte les neuf critères ; à défaut on lit le CIBDAI.
                  const source = dujour.find((s) => item.id in s.items)
                  const cotation = source?.items[item.id]
                  if (cotation === undefined) return null
                  return (
                    <div key={item.id} className="flex justify-between gap-3">
                      <dt className="text-slate-600">{item.critere}</dt>
                      <dd className="shrink-0 font-semibold tabular-nums text-slate-900">
                        {cotation}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </Card>
        )
      })}

      {!isVet && (
        <Button type="button" className="w-full" onClick={() => setSaisie(true)}>
          Nouvelle évaluation
        </Button>
      )}

      {saisie && (
        <ScoreSheet
          dogId={dogId}
          onClose={() => setSaisie(false)}
          onSaved={() => {
            setSaisie(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
