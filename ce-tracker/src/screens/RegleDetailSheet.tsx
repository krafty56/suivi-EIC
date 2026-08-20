import type { Absence, Crise } from '../lib/types'
import type { JourDetail, PointRepere, ReglePersonnelle } from '../lib/reglePersonnelle'
import { formatShortDate } from '../lib/date'
import { Sheet } from '../components/ui'

type Props = {
  dogName: string
  regle: ReglePersonnelle
  crises: Crise[]
  absences: Absence[]
  onClose: () => void
}

function ligneJour(jour: JourDetail) {
  const parts: string[] = []
  if (jour.scoreFecal !== null) parts.push(`score fécal ${jour.scoreFecal}`)
  if (jour.vomissements > 0) parts.push(`${jour.vomissements} vomissement${jour.vomissements > 1 ? 's' : ''}`)
  for (const s of jour.symptomes) parts.push(s.intensite !== null ? `${s.nom} (${s.intensite})` : s.nom)
  return (
    <li key={jour.date} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{formatShortDate(jour.date)}</span>
      <span className="min-w-0 flex-1 text-right text-slate-700">
        {parts.length > 0 ? parts.join(' · ') : 'Rien de signalé'}
      </span>
    </li>
  )
}

function SectionPoint({ titre, point }: { titre: string; point: PointRepere }) {
  return (
    <div>
      <p className="text-sm font-bold text-slate-900">{titre}</p>
      {point.declare ? (
        <p className="mt-1 text-sm text-slate-600">
          Repère déclaré à la main, pas encore de semaine réelle à détailler.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-slate-500">
            {point.debut && point.fin && (
              <>
                Du {formatShortDate(point.debut)} au {formatShortDate(point.fin)} · {point.jours.length} jour
                {point.jours.length > 1 ? 's' : ''} observé{point.jours.length > 1 ? 's' : ''} · indice moyen{' '}
                {point.indice.toFixed(1)}
              </>
            )}
          </p>
          <ul className="mt-1 divide-y divide-slate-100">{point.jours.map(ligneJour)}</ul>
        </>
      )}
    </div>
  )
}

/** Ce qui a servi au calcul de la règle personnelle, jour par jour — pour
 * que la position sur la règle reste vérifiable plutôt qu'une boîte noire. */
export default function RegleDetailSheet({ dogName, regle, crises, absences, onClose }: Props) {
  return (
    <Sheet title="Détail du repère personnel" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Chaque jour observé est résumé par une note qui moyenne le score fécal, les vomissements et chaque
          symptôme noté ce jour-là. Le pire épisode et la meilleure période sont la semaine la plus sévère et la
          plus calme de l’historique de {dogName} (au moins 4 jours observés), en excluant les semaines de crise ou
          d’absence pour la meilleure période.
        </p>

        <SectionPoint titre="Pire épisode" point={regle.pire} />
        <SectionPoint titre="Meilleure période" point={regle.meilleure} />

        <div>
          <p className="text-sm font-bold text-slate-900">Aujourd’hui (7 derniers jours)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Du {formatShortDate(regle.aujourdhui.debut)} au {formatShortDate(regle.aujourdhui.fin)} ·{' '}
            {regle.aujourdhui.jours.length} jour{regle.aujourdhui.jours.length > 1 ? 's' : ''} observé
            {regle.aujourdhui.jours.length > 1 ? 's' : ''}
          </p>
          <ul className="mt-1 divide-y divide-slate-100">{regle.aujourdhui.jours.map(ligneJour)}</ul>
        </div>

        {(crises.length > 0 || absences.length > 0) && (
          <div>
            <p className="text-sm font-bold text-slate-900">Crises et absences exclues de la meilleure période</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              {crises.map((c) => (
                <li key={c.id}>
                  🚨 Crise du {formatShortDate(c.date_debut)}
                  {c.date_fin ? ` au ${formatShortDate(c.date_fin)}` : ' (en cours)'}
                </li>
              ))}
              {absences.map((a) => (
                <li key={a.id}>
                  🧳 Absence du {formatShortDate(a.date_debut)}
                  {a.date_fin ? ` au ${formatShortDate(a.date_fin)}` : ' (en cours)'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
