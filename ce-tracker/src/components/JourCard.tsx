import { CHANGEMENT_OPTIONS } from '../data/catalogs'
import { EMOJI_CRISE } from '../data/emoji'
import { formatLongDate, formatShortDate } from '../lib/date'
import { type Categorie, type Gravite, type Jour, texteLigne } from '../lib/journal'
import { stoolPhotoUrl } from '../lib/storage'
import type { Crise, SuiviEvent } from '../lib/types'
import { Card } from './ui'

const BARRE_GRAVITE: Record<Gravite, string> = {
  rouge: 'bg-red-700',
  orange: 'bg-amber-800',
  verte: 'bg-brand-200',
  neutre: 'bg-slate-200',
}

function correspond(texte: string, recherche: string): boolean {
  return recherche.trim() === '' || texte.toLowerCase().includes(recherche.trim().toLowerCase())
}

function Badge({ tone, children }: { tone: 'slate' | 'brand' | 'amber'; children: React.ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-100 text-brand-800',
    amber: 'bg-amber-100 text-amber-800',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tones[tone]}`}>
      {children}
    </span>
  )
}

type Props = {
  jour: Jour
  repas: SuiviEvent[]
  recherche?: string
  categoriesActives?: Set<Categorie>
  onDelete?: (id: string) => void
  onDeletePoids?: (id: string) => void
  onZoom?: (event: SuiviEvent) => void
  onEditCrise?: (crise: Crise) => void
}

/** Carte d'une journée : badges de résumé, crise éventuelle, puis chaque
 * entrée. Sans recherche/filtre ni gestionnaires, elle s'affiche en lecture
 * seule — c'est ce que l'export PDF utilise pour être visuellement identique
 * à l'Historique plutôt qu'une mise en page distincte. */
export default function JourCard({
  jour,
  repas,
  recherche = '',
  categoriesActives = new Set(),
  onDelete,
  onDeletePoids,
  onZoom,
  onEditCrise,
}: Props) {
  const lignesFiltrees = jour.lignes.filter((ligne) => {
    if (categoriesActives.size > 0 && !categoriesActives.has(ligne.categorie)) return false
    if (recherche.trim() === '') return true
    const texte = texteLigne(ligne, repas)
    return (
      correspond(texte.titre, recherche) ||
      correspond(texte.sousTitre ?? '', recherche) ||
      (ligne.kind === 'event' && correspond(ligne.event.note ?? '', recherche))
    )
  })

  const crisesFiltrees = jour.crises.filter(
    (crise) =>
      recherche.trim() === '' ||
      correspond(crise.note ?? '', recherche) ||
      crise.changements.some((c) => correspond(CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c, recherche)),
  )

  if (lignesFiltrees.length === 0 && crisesFiltrees.length === 0) return null

  return (
    <Card className="overflow-hidden p-0 break-inside-avoid">
      <div className="flex">
        <span className={`w-1.5 shrink-0 ${BARRE_GRAVITE[jour.gravite]}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-slate-900 first-letter:uppercase">
              {formatLongDate(jour.date)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {jour.resume.reflux > 0 && <Badge tone="slate">{jour.resume.reflux} reflux</Badge>}
              {jour.resume.selleScore !== null && <Badge tone="brand">selle {jour.resume.selleScore}/7</Badge>}
              {jour.resume.vomissements > 0 && (
                <Badge tone="amber">
                  {jour.resume.vomissements} vomissement{jour.resume.vomissements > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {crisesFiltrees.map((crise) => {
            const contenu = (
              <>
                <p className="text-sm font-bold text-red-800">
                  {EMOJI_CRISE} Crise signalée
                  {crise.changements.length > 0 &&
                    ` — ${crise.changements
                      .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                      .join(', ')}`}
                </p>
                <p className="mt-0.5 text-xs font-medium text-red-700">
                  {crise.date_fin ? `Jusqu’au ${formatShortDate(crise.date_fin)}` : 'En cours'}
                </p>
                {crise.note && <p className="mt-0.5 text-sm text-red-900">{crise.note}</p>}
              </>
            )
            return onEditCrise ? (
              <button
                key={crise.id}
                type="button"
                onClick={() => onEditCrise(crise)}
                className="mb-1.5 w-full rounded-xl bg-red-50 px-3 py-2 text-left"
              >
                {contenu}
              </button>
            ) : (
              <div key={crise.id} className="mb-1.5 rounded-xl bg-red-50 px-3 py-2">
                {contenu}
              </div>
            )
          })}

          {lignesFiltrees.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {lignesFiltrees.map((ligne) => {
                const texte = texteLigne(ligne, repas)
                return (
                  <li key={ligne.id} className="flex items-center gap-2 py-2">
                    <span className="shrink-0 text-lg" aria-hidden="true">
                      {texte.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{texte.titre}</span>
                      {texte.sousTitre && (
                        <span className="block truncate text-xs text-slate-500">{texte.sousTitre}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{texte.heure}</span>
                    <span className="w-8 shrink-0">
                      {ligne.kind === 'event' &&
                        ligne.event.type === 'selle' &&
                        ligne.event.storage_path &&
                        (onZoom ? (
                          <button type="button" onClick={() => onZoom(ligne.event)}>
                            <img
                              src={stoolPhotoUrl(ligne.event.storage_path)}
                              alt=""
                              className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200"
                            />
                          </button>
                        ) : (
                          <img
                            src={stoolPhotoUrl(ligne.event.storage_path)}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200"
                          />
                        ))}
                    </span>
                    {(onDelete || onDeletePoids) && (
                      <button
                        type="button"
                        aria-label={ligne.kind === 'poids' ? 'Supprimer la pesée' : `Supprimer ${ligne.event.nom}`}
                        onClick={() =>
                          ligne.kind === 'poids' ? onDeletePoids?.(ligne.id) : onDelete?.(ligne.id)
                        }
                        className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
                      >
                        &times;
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
