import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Absence,
  Crise,
  DailyEntry,
  Dog,
  DogMedication,
  FoodEntry,
  RepereesPersonnels,
  SuiviEvent,
} from '../lib/types'
import { construireReglePersonnelle, type ReglePersonnelle } from '../lib/reglePersonnelle'
import { usePremium } from '../lib/premium'
import { useVetMode } from '../lib/vetMode'
import { Button, Card } from '../components/ui'
import { Verrou } from '../components/Verrou'
import RepereInitialSheet from './RepereInitialSheet'

type Props = { dog: Dog }

const COULEUR_GRADIENT = 'linear-gradient(to right, #A8443D 0%, #C17A4C 26%, #D9BE73 50%, #9FB870 74%, #BFCC94 100%)'

export default function ReglePersonnelleCard({ dog }: Props) {
  const { isPremium } = usePremium()
  const isVet = useVetMode()
  const [regle, setRegle] = useState<ReglePersonnelle | null | undefined>(undefined)
  const [repereDeclare, setRepereDeclare] = useState<RepereesPersonnels | null>(null)
  const [sheetOuverte, setSheetOuverte] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)

  useEffect(() => {
    if (!isPremium) return
    let ignore = false

    async function charger() {
      const [entriesRes, eventsRes, crisesRes, absencesRes, medsRes, foodRes, repereRes] = await Promise.all([
        supabase.from('daily_entries').select('*').eq('dog_id', dog.id),
        supabase.from('events').select('*').eq('dog_id', dog.id),
        supabase.from('crises').select('*').eq('dog_id', dog.id),
        supabase.from('absences').select('*').eq('dog_id', dog.id),
        supabase.from('dog_medications').select('*').eq('dog_id', dog.id),
        supabase.from('food_entries').select('*').eq('dog_id', dog.id),
        supabase.from('reperes_personnels').select('*').eq('dog_id', dog.id).maybeSingle(),
      ])
      if (ignore) return

      const entries = (entriesRes.data ?? []) as DailyEntry[]
      const events = (eventsRes.data ?? []) as SuiviEvent[]
      const crises = (crisesRes.data ?? []) as Crise[]
      const absences = (absencesRes.data ?? []) as Absence[]
      const medications = (medsRes.data ?? []) as DogMedication[]
      const foodEntries = (foodRes.data ?? []) as FoodEntry[]
      // Table récente : une absence (relation inexistante) équivaut à aucun
      // repère déclaré plutôt qu'à une erreur bloquante.
      const repere = repereRes.error ? null : (repereRes.data as RepereesPersonnels | null)
      const traitementEvents = events.filter((e) => e.type === 'traitement')

      setRepereDeclare(repere)
      setRegle(
        construireReglePersonnelle(entries, events, crises, absences, traitementEvents, medications, foodEntries, repere),
      )
    }

    void charger()
    return () => {
      ignore = true
    }
  }, [dog.id, isPremium, refreshSignal])

  if (!isPremium) {
    return (
      <Verrou
        titre="Repère personnel"
        description="Positionne l'état actuel de ton chien entre son pire épisode et sa meilleure période — réservé au premium."
      />
    )
  }

  if (regle === undefined) return null

  if (regle === null) {
    return (
      <>
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Repère personnel</p>
            <p className="text-lg font-bold text-slate-900">Où en est {dog.name} aujourd’hui ?</p>
            <p className="text-sm text-slate-600">
              Pas encore assez d’historique en base pour calculer automatiquement les deux bornes. Déclare le pire
              épisode et la meilleure période que tu te rappelles pour démarrer — la règle se recalibrera ensuite
              toute seule sur les vraies données de {dog.name}.
            </p>
            {!isVet && (
              <Button type="button" className="mt-1 w-full py-2.5 text-sm" onClick={() => setSheetOuverte(true)}>
                Déclarer mes repères de départ
              </Button>
            )}
          </div>
        </Card>
        {sheetOuverte && (
          <RepereInitialSheet
            dogId={dog.id}
            dogName={dog.name}
            repere={repereDeclare}
            onClose={() => setSheetOuverte(false)}
            onSaved={() => {
              setSheetOuverte(false)
              setRefreshSignal((n) => n + 1)
            }}
          />
        )}
      </>
    )
  }

  const contexteAujourdhui = regle.aujourdhui.traitement || regle.aujourdhui.alimentation

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Repère personnel</p>
            <p className="text-lg font-bold text-slate-900">Où en est {dog.name} aujourd’hui ?</p>
            {regle.toutCalcule ? (
              <p className="text-xs text-slate-500">
                Comparé aux propres extrêmes de {dog.name}, pas à une moyenne générale.
              </p>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Repères initiaux — à affiner avec le temps
              </span>
            )}
          </div>

          <div className="relative pt-9 pb-1">
            {regle.crises.map((tick) => (
              <div
                key={tick.id}
                className="absolute top-5 flex -translate-x-1/2 flex-col items-center gap-0.5"
                style={{ left: `${tick.position}%` }}
                title={tick.label}
              >
                <span className="text-[9px] font-semibold whitespace-nowrap text-slate-400">{tick.label}</span>
                <span className="h-2 w-px bg-slate-300" />
              </div>
            ))}

            <div
              className="h-2.5 rounded-full shadow-[inset_0_1px_2px_rgba(13,24,33,0.12)]"
              style={{ background: COULEUR_GRADIENT, opacity: regle.toutCalcule ? 1 : 0.55 }}
            />

            <div
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{ left: `${regle.position}%` }}
            >
              <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">
                Aujourd’hui
              </span>
              <span className="h-[17px] w-[17px] rounded-full border-[3px] border-white bg-brand-700 shadow-md" />
            </div>
          </div>

          <div className="flex justify-between gap-3">
            <div className="flex max-w-[48%] flex-col gap-0.5">
              <p className="text-xs font-bold text-red-700">
                Pire épisode {regle.pire.declare && <span className="font-medium text-slate-400">(déclaré)</span>}
              </p>
              <p className="text-[11px] text-slate-500">{regle.pire.label}</p>
              {regle.pire.traitement && (
                <p className="text-[11px] leading-snug text-slate-500 italic">{regle.pire.traitement}</p>
              )}
            </div>
            <div className="flex max-w-[48%] flex-col items-end gap-0.5 text-right">
              <p className="text-xs font-bold text-[#4a5c30]">
                Meilleure période{' '}
                {regle.meilleure.declare && <span className="font-medium text-slate-400">(déclarée)</span>}
              </p>
              <p className="text-[11px] text-slate-500">{regle.meilleure.label}</p>
              {regle.meilleure.traitement && (
                <p className="text-[11px] leading-snug text-slate-500 italic">{regle.meilleure.traitement}</p>
              )}
            </div>
          </div>

          {contexteAujourdhui && (
            <div className="flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
              <span className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true">
                🩺
              </span>
              <p className="text-xs leading-relaxed text-slate-900">
                <span className="font-bold">Aujourd’hui</span> — sous{' '}
                {regle.aujourdhui.traitement && <strong>{regle.aujourdhui.traitement}</strong>}
                {regle.aujourdhui.traitement && regle.aujourdhui.alimentation && ' + '}
                {regle.aujourdhui.alimentation && <strong>{regle.aujourdhui.alimentation}</strong>}
              </p>
            </div>
          )}

          {!isVet && (
            <Button
              type="button"
              variant="secondary"
              className="w-fit py-2 text-xs"
              onClick={() => setSheetOuverte(true)}
            >
              Modifier mes repères de départ
            </Button>
          )}
        </div>
      </Card>

      <p className="px-1 text-xs leading-snug text-slate-400">
        {regle.toutCalcule
          ? 'Les deux bornes et les repères de crise sont calculés à partir des vraies saisies enregistrées.'
          : `Repères de départ déclarés à la main : la règle se recalibrera automatiquement dès que l’historique réel de ${dog.name} sera assez fourni.`}
      </p>

      {sheetOuverte && (
        <RepereInitialSheet
          dogId={dog.id}
          dogName={dog.name}
          repere={repereDeclare}
          onClose={() => setSheetOuverte(false)}
          onSaved={() => {
            setSheetOuverte(false)
            setRefreshSignal((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
