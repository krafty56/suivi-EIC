import { useEffect, useMemo, useState } from 'react'
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import type { LabValue } from '../lib/types'
import {
  CATEGORIE_LABELS,
  calculerFlag,
  calculerTendance,
  grouperParImport,
  grouperParParametre,
  libelleFlag,
  parseValeur,
  resumerParametre,
  type ParameterGroup,
} from '../lib/labValues'
import { formatLongDate, formatShortDateAvecAnnee } from '../lib/date'
import { useVetMode } from '../lib/vetMode'
import { Button, Card, ErrorMessage, Field, Sheet, Spinner, inputClass } from '../components/ui'
import LabAnalysisImportSheet from './LabAnalysisImport'

type Props = { dogId: string }

const COULEUR_FLAG: Record<string, string> = {
  normal: '#344966',
  low: '#d9a45b',
  high: '#d9a45b',
  abnormal: '#c0524b',
}

export default function LabValuesScreen({ dogId }: Props) {
  const isVet = useVetMode()
  const [valeurs, setValeurs] = useState<LabValue[] | null>(null)
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [gererOuvert, setGererOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<LabValue | null>(null)

  async function charger() {
    const { data, error: dbError } = await supabase
      .from('lab_values')
      .select('*')
      .eq('dog_id', dogId)
      .order('date', { ascending: true })
    if (dbError) setError(dbError.message)
    else setValeurs(data as LabValue[])
  }

  useEffect(() => {
    void charger()
  }, [dogId])

  async function supprimerImport(batch: string) {
    if (!confirm('Supprimer cette analyse et tous ses paramètres ?')) return
    const { error: dbError } = await supabase.from('lab_values').delete().eq('import_batch', batch)
    if (dbError) setError(dbError.message)
    else void charger()
  }

  async function supprimerMesure(id: string) {
    if (!confirm('Supprimer cette mesure ?')) return
    const { error: dbError } = await supabase.from('lab_values').delete().eq('id', id)
    if (dbError) setError(dbError.message)
    else void charger()
  }

  async function modifierMesure(
    id: string,
    patch: { value: number | null; value_text: string | null; ref_low: number | null; ref_high: number | null },
  ) {
    const { error: dbError } = await supabase
      .from('lab_values')
      .update({ ...patch, flag: calculerFlag(patch.value, patch.ref_low, patch.ref_high) })
      .eq('id', id)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setEnEdition(null)
    void charger()
  }

  const imports = useMemo(() => (valeurs ? grouperParImport(valeurs) : []), [valeurs])
  const groupes = useMemo(() => (valeurs ? grouperParParametre(valeurs) : []), [valeurs])

  const categories = useMemo(
    () => [...new Set(groupes.map((g) => g.category).filter((c): c is string => !!c))].sort(),
    [groupes],
  )

  const horsIntervalle = groupes.filter((g) => g.derniere.flag && g.derniere.flag !== 'normal')
  const tendanceNette = groupes.filter((g) => {
    const t = calculerTendance(g.mesures)
    return t && Math.abs(t.pct) >= 25
  })

  const filtres = useMemo(() => {
    let liste = groupes
    if (filtre === '__hors_intervalle__') liste = horsIntervalle
    else if (filtre) liste = liste.filter((g) => g.category === filtre)
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase()
      liste = liste.filter((g) => g.label.toLowerCase().includes(q))
    }
    return [...liste].sort((a, b) => {
      const aHors = a.derniere.flag && a.derniere.flag !== 'normal' ? 0 : 1
      const bHors = b.derniere.flag && b.derniere.flag !== 'normal' ? 0 : 1
      return aHors - bHors || a.label.localeCompare(b.label)
    })
  }, [groupes, filtre, recherche, horsIntervalle])

  if (error) return <div className="p-4"><ErrorMessage>{error}</ErrorMessage></div>
  if (valeurs === null) return <Spinner />

  return (
    <div className="space-y-3 p-4">
      {groupes.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Aucune analyse importée. Photographiez le tableau de résultats d’une prise de sang ou
            d’une analyse d’urine : l’app en extrait les paramètres, avec l’intervalle et le
            graphique de suivi.
          </p>
          {!isVet && (
            <Button type="button" className="mt-3 w-full" onClick={() => setImportOuvert(true)}>
              Ajouter une analyse
            </Button>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{groupes.length}</p>
                <p className="text-xs text-slate-500">paramètres suivis</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-red-700">
                  {horsIntervalle.length}
                </p>
                <p className="text-xs text-slate-500">hors intervalle</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {tendanceNette.length}
                </p>
                <p className="text-xs text-slate-500">tendance nette</p>
              </div>
            </div>
            {groupes.length > 0 && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Dernier examen enregistré :{' '}
                {formatShortDateAvecAnnee(groupes.reduce((max, g) => (g.derniere.date > max ? g.derniere.date : max), groupes[0].derniere.date))}
              </p>
            )}
            {imports.length > 0 && !isVet && (
              <button
                type="button"
                onClick={() => setGererOuvert(true)}
                className="mt-2 block w-full text-center text-xs font-medium text-brand-700 underline"
              >
                Gérer les analyses importées ({imports.length})
              </button>
            )}
          </Card>

          {!isVet && (
            <Button type="button" className="w-full" onClick={() => setImportOuvert(true)}>
              Ajouter une analyse
            </Button>
          )}

          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un paramètre…"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Puce
              actif={filtre === '__hors_intervalle__'}
              onClick={() => setFiltre(filtre === '__hors_intervalle__' ? null : '__hors_intervalle__')}
            >
              Hors intervalle
            </Puce>
            {categories.map((cat) => (
              <Puce key={cat} actif={filtre === cat} onClick={() => setFiltre(filtre === cat ? null : cat)}>
                {CATEGORIE_LABELS[cat] ?? cat}
              </Puce>
            ))}
          </div>

          {filtres.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Aucun paramètre ne correspond.</p>
            </Card>
          ) : (
            filtres.map((groupe) => (
              <ParametreCard
                key={groupe.key}
                groupe={groupe}
                onSupprimer={isVet ? undefined : supprimerMesure}
                onModifier={isVet ? undefined : setEnEdition}
              />
            ))
          )}
        </>
      )}

      {importOuvert && (
        <LabAnalysisImportSheet
          dogId={dogId}
          onClose={() => setImportOuvert(false)}
          onSaved={() => {
            setImportOuvert(false)
            void charger()
          }}
        />
      )}

      {gererOuvert && (
        <GererImportsSheet imports={imports} onSupprimer={supprimerImport} onClose={() => setGererOuvert(false)} />
      )}

      {enEdition && (
        <EditMesureSheet
          mesure={enEdition}
          onEnregistrer={modifierMesure}
          onClose={() => setEnEdition(null)}
        />
      )}
    </div>
  )
}

function EditMesureSheet({
  mesure,
  onEnregistrer,
  onClose,
}: {
  mesure: LabValue
  onEnregistrer: (
    id: string,
    patch: { value: number | null; value_text: string | null; ref_low: number | null; ref_high: number | null },
  ) => void
  onClose: () => void
}) {
  const [valeur, setValeur] = useState(mesure.value !== null ? String(mesure.value) : (mesure.value_text ?? ''))
  const [refLow, setRefLow] = useState<number | null>(mesure.ref_low)
  const [refHigh, setRefHigh] = useState<number | null>(mesure.ref_high)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    onEnregistrer(mesure.id, { ...parseValeur(valeur), ref_low: refLow, ref_high: refHigh })
  }

  return (
    <Sheet title={mesure.parameter_label} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          {formatShortDateAvecAnnee(mesure.date)}
          {mesure.lab_name ? ` · ${mesure.lab_name}` : ''}
        </p>

        <Field label={`Valeur${mesure.unit ? ` (${mesure.unit})` : ''}`}>
          <input
            type="text"
            inputMode="decimal"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Référence min">
            <input
              type="number"
              step="any"
              value={refLow ?? ''}
              onChange={(e) => setRefLow(e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Référence max">
            <input
              type="number"
              step="any"
              value={refHigh ?? ''}
              onChange={(e) => setRefHigh(e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>

        <Button type="submit" className="w-full">
          Enregistrer
        </Button>
      </form>
    </Sheet>
  )
}

function GererImportsSheet({
  imports,
  onSupprimer,
  onClose,
}: {
  imports: ReturnType<typeof grouperParImport>
  onSupprimer: (batch: string) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Analyses importées" onClose={onClose}>
      <div className="space-y-2">
        {imports.map((lot) => (
          <div
            key={lot.batch}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800 first-letter:uppercase">
                {formatLongDate(lot.date)}
              </p>
              <p className="text-xs text-slate-500">
                {lot.lab_name ? `${lot.lab_name} · ` : ''}
                {lot.nombre} paramètre{lot.nombre > 1 ? 's' : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              className="shrink-0 px-3 py-2 text-sm"
              onClick={() => onSupprimer(lot.batch)}
            >
              Supprimer
            </Button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        actif ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function ParametreCard({
  groupe,
  onSupprimer,
  onModifier,
}: {
  groupe: ParameterGroup
  onSupprimer?: (id: string) => void
  onModifier?: (mesure: LabValue) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const { mesures, derniere, unitesHeterogenes } = groupe
  const tendance = calculerTendance(mesures)
  const flagLabel = libelleFlag(derniere.flag)

  const points = mesures.map((m) => ({
    date: m.date,
    label: formatShortDateAvecAnnee(m.date),
    value: m.value,
    flag: m.flag,
  }))
  const numeriques = points.filter((p) => p.value !== null)

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{derniere.parameter_label}</p>
          <p className="text-xs text-slate-500">
            {mesures.length} mesure{mesures.length > 1 ? 's' : ''} · dernière le{' '}
            {formatShortDateAvecAnnee(derniere.date)}
          </p>
        </div>
        {flagLabel && (
          <span
            className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
            style={{
              backgroundColor: derniere.flag === 'normal' ? '#eef1e6' : '#f6e8ce',
              color: derniere.flag === 'normal' ? '#4a5c30' : '#855520',
            }}
          >
            {flagLabel}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        {derniere.value !== null ? (
          <>
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {derniere.value}
            </span>
            {derniere.unit && <span className="text-sm text-slate-500">{derniere.unit}</span>}
          </>
        ) : (
          <span className="text-lg font-semibold text-slate-700">{derniere.value_text ?? '—'}</span>
        )}
        {tendance && (
          <span
            title="Écart avec la mesure précédente de même unité — distinct de la tendance sur l’ensemble de la période, décrite plus bas."
            className={`text-sm font-medium tabular-nums ${tendance.delta > 0 ? 'text-red-700' : 'text-brand-700'}`}
          >
            {tendance.delta > 0 ? '↗' : tendance.delta < 0 ? '↘' : '→'} {tendance.delta > 0 ? '+' : ''}
            {Math.round(tendance.delta * 100) / 100} ({tendance.pct > 0 ? '+' : ''}
            {Math.round(tendance.pct)} % vs précédente)
          </span>
        )}
      </div>

      {derniere.ref_low !== null && derniere.ref_high !== null && (
        <p className="text-xs text-slate-500">
          Référence {derniere.ref_low} – {derniere.ref_high} {derniere.unit}
        </p>
      )}

      {numeriques.length >= 2 && (
        <div className="mt-3 h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedLabChart points={numeriques} refLow={derniere.ref_low} refHigh={derniere.ref_high} />
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-sm text-slate-600">{resumerParametre(groupe)}</p>

      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="mt-2 text-sm font-medium text-brand-700 underline"
      >
        {ouvert ? 'Masquer le détail des mesures' : 'Voir le détail des mesures'}
      </button>

      {ouvert && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="pb-1 pr-2 font-medium">Date</th>
                <th className="pb-1 pr-2 text-right font-medium">Valeur</th>
                <th className="pb-1 pr-2 font-medium">Unité</th>
                <th className="pb-1 pr-2 text-right font-medium">Réf.</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...mesures].reverse().map((m) => (
                <tr
                  key={m.id}
                  onClick={onModifier ? () => onModifier(m) : undefined}
                  className={onModifier ? 'cursor-pointer hover:bg-slate-50' : ''}
                >
                  <td className="py-1.5 pr-2 tabular-nums text-slate-700">
                    {formatShortDateAvecAnnee(m.date)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-900">
                    {m.value !== null ? m.value : (m.value_text ?? '—')}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-500">{m.unit ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-right text-slate-500 tabular-nums">
                    {m.ref_low !== null && m.ref_high !== null ? `${m.ref_low} – ${m.ref_high}` : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    {onSupprimer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSupprimer(m.id)
                        }}
                        aria-label="Supprimer cette mesure"
                        className="text-slate-400 hover:text-red-600"
                      >
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unitesHeterogenes && (
        <p className="mt-3 text-xs text-slate-500 italic">
          Unités hétérogènes selon les méthodes de dosage : comparez uniquement les mesures de
          même unité.
        </p>
      )}
    </Card>
  )
}

/** Ligne reliant les mesures numériques, points colorés selon le drapeau,
 * bande de référence en fond quand les bornes existent. */
function ComposedLabChart({
  points,
  refLow,
  refHigh,
}: {
  points: { label: string; value: number | null; flag: string | null }[]
  refLow: number | null
  refHigh: number | null
}) {
  return (
    <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
      {refLow !== null && refHigh !== null && (
        <ReferenceArea y1={refLow} y2={refHigh} fill="#344966" fillOpacity={0.06} />
      )}
      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={20} />
      <YAxis tick={{ fontSize: 9 }} width={32} />
      <Tooltip
        labelFormatter={(l) => l}
        formatter={(v) => [v, 'valeur']}
        contentStyle={{ fontSize: 11, borderRadius: 8 }}
      />
      <Line
        type="monotone"
        dataKey="value"
        stroke="#344966"
        strokeWidth={1.75}
        dot={(props: { cx?: number; cy?: number; payload?: { flag: string | null } }) => {
          const { cx, cy, payload } = props
          if (cx === undefined || cy === undefined) return <g key={`${cx}-${cy}`} />
          const couleur = COULEUR_FLAG[payload?.flag ?? ''] ?? '#344966'
          return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3} fill={couleur} stroke="none" />
        }}
        connectNulls
      />
    </LineChart>
  )
}
