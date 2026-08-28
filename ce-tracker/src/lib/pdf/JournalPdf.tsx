import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer'
import type { Dog, DogMedication, FoodEntry, SuiviEvent } from '../types'
import { BCS_SCALE, CHANGEMENT_OPTIONS } from '../../data/catalogs'
import { calculerAge, formatLongDate, formatPlageAbsence, formatShortDate, formatTime, veilleDe } from '../date'
import { texteLigne, type Jour } from '../journal'

const COULEURS = {
  encre: '#0D1821',
  brand700: '#344966',
  brand200: '#BFCC94',
  brandPoudre: '#B4CDED',
  rouge: '#A8443D',
  rougeFond: '#F8ECE9',
  rougeTexte: '#702C26',
  ambre: '#855520',
  ambreFond: '#F6E8CE',
  slate100: '#F1F1F2',
  slate200: '#E3E4E6',
  slate400: '#999EA2',
  slate500: '#6E747A',
  slate600: '#5A6268',
}

const BARRE_GRAVITE: Record<Jour['gravite'], string> = {
  rouge: COULEURS.rouge,
  orange: COULEURS.ambre,
  verte: COULEURS.brand200,
  neutre: COULEURS.slate200,
}

const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontSize: 9.5, fontFamily: 'Helvetica', color: COULEURS.encre },
  entete: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
  logoTexte: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  titre: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 3 },
  sousTitre: { fontSize: 9, color: COULEURS.slate600, marginBottom: 14 },
  section: { marginBottom: 12 },
  carteBlanche: {
    borderWidth: 1,
    borderColor: COULEURS.slate200,
    borderRadius: 6,
    padding: 10,
  },
  sectionTitre: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  ficheGrille: { flexDirection: 'row', flexWrap: 'wrap' },
  ficheItem: { width: '33%', marginBottom: 7, paddingRight: 6 },
  ficheTerme: { fontSize: 7.5, color: COULEURS.slate500 },
  ficheValeur: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  medLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
  },
  medNom: { fontSize: 9.5 },
  medDose: { fontSize: 9.5, color: COULEURS.slate500 },
  medHeure: { fontSize: 8.5, color: COULEURS.slate500 },
  alimNom: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  alimActuel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COULEURS.brand700, marginLeft: 5 },
  alimPeriode: { fontSize: 8, color: COULEURS.slate500, marginTop: 1 },
  alimNote: { fontSize: 8.5, marginTop: 1, fontStyle: 'italic' },
  jourCarte: { flexDirection: 'row', marginBottom: 6, borderRadius: 4 },
  jourBarre: { width: 3, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  jourContenu: {
    flex: 1,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COULEURS.slate200,
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  jourHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jourDate: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textTransform: 'capitalize' },
  badges: { flexDirection: 'row', gap: 4 },
  badge: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 7,
    backgroundColor: COULEURS.slate100,
    color: COULEURS.slate600,
  },
  badgeBrand: { backgroundColor: '#E4EAF1', color: COULEURS.brand700 },
  badgeAmbre: { backgroundColor: COULEURS.ambreFond, color: COULEURS.ambre },
  bandeau: { borderRadius: 4, padding: 6, marginBottom: 4 },
  bandeauAbsence: { backgroundColor: COULEURS.slate100 },
  bandeauCrise: { backgroundColor: COULEURS.rougeFond },
  bandeauTitre: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  bandeauTitreCrise: { color: COULEURS.rougeTexte },
  bandeauSousTitre: { fontSize: 7.5, marginTop: 1, color: COULEURS.slate600 },
  bandeauSousTitreCrise: { color: COULEURS.rouge },
  bandeauNote: { fontSize: 8, marginTop: 2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: COULEURS.slate100,
  },
  ligneTexte: { flex: 1 },
  ligneTitre: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  ligneSousTitre: { fontSize: 7.5, color: COULEURS.slate500, marginTop: 0.5 },
  ligneHeure: { fontSize: 7.5, color: COULEURS.slate500, width: 34, textAlign: 'right' },
  pied: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: COULEURS.slate400,
    textAlign: 'center',
  },
  videTexte: { fontSize: 9, color: COULEURS.slate500 },
})

function PdfLogo() {
  return (
    <View style={styles.entete}>
      <Svg width={18} height={14} viewBox="0 0 30 24">
        <Rect x={0} y={14} width={6.4} height={10} rx={1.6} fill={COULEURS.brandPoudre} />
        <Rect x={9.4} y={7} width={6.4} height={17} rx={1.6} fill={COULEURS.brandPoudre} />
        <Rect x={18.8} y={0} width={6.4} height={24} rx={1.6} fill={COULEURS.brandPoudre} />
      </Svg>
      <Text style={styles.logoTexte}>
        <Text style={{ color: COULEURS.brand700 }}>app</Text>
        <Text style={{ color: COULEURS.brand200 }}>eic</Text>
      </Text>
    </View>
  )
}

function ChampFiche({ terme, valeur }: { terme: string; valeur: string | null }) {
  return (
    <View style={styles.ficheItem}>
      <Text style={styles.ficheTerme}>{terme}</Text>
      <Text style={styles.ficheValeur}>{valeur ?? '—'}</Text>
    </View>
  )
}

function Badge({ tone, children }: { tone: 'slate' | 'brand' | 'amber'; children: string }) {
  const style = tone === 'brand' ? styles.badgeBrand : tone === 'amber' ? styles.badgeAmbre : {}
  return (
    <View style={[styles.badge, style]}>
      <Text>{children}</Text>
    </View>
  )
}

function JourBloc({ jour, repas }: { jour: Jour; repas: SuiviEvent[] }) {
  return (
    <View style={styles.jourCarte} wrap={false}>
      <View style={[styles.jourBarre, { backgroundColor: BARRE_GRAVITE[jour.gravite] }]} />
      <View style={styles.jourContenu}>
        <View style={styles.jourHeader}>
          <Text style={styles.jourDate}>{formatLongDate(jour.date)}</Text>
          <View style={styles.badges}>
            {jour.absenceActive && <Badge tone="slate">Absence</Badge>}
            {jour.resume.reflux > 0 && <Badge tone="slate">{`${jour.resume.reflux} reflux`}</Badge>}
            {jour.resume.selleScore !== null && <Badge tone="brand">{`selle ${jour.resume.selleScore}/7`}</Badge>}
            {jour.resume.vomissements > 0 && (
              <Badge tone="amber">{`${jour.resume.vomissements} vomissement${jour.resume.vomissements > 1 ? 's' : ''}`}</Badge>
            )}
          </View>
        </View>

        {jour.absences.map((absence) => (
          <View key={absence.id} style={[styles.bandeau, styles.bandeauAbsence]}>
            <Text style={styles.bandeauTitre}>Absence signalée</Text>
            <Text style={styles.bandeauSousTitre}>{formatPlageAbsence(absence)}</Text>
            {absence.note && <Text style={styles.bandeauNote}>{absence.note}</Text>}
          </View>
        ))}

        {jour.crises.map((crise) => (
          <View key={crise.id} style={[styles.bandeau, styles.bandeauCrise]}>
            <Text style={[styles.bandeauTitre, styles.bandeauTitreCrise]}>
              Crise signalée
              {crise.changements.length > 0 &&
                ` — ${crise.changements
                  .map((c) => CHANGEMENT_OPTIONS.find((o) => o.value === c)?.label ?? c)
                  .join(', ')}`}
            </Text>
            <Text style={[styles.bandeauSousTitre, styles.bandeauSousTitreCrise]}>
              {crise.date_fin ? `Jusqu’au ${formatShortDate(crise.date_fin)}` : 'En cours'}
            </Text>
            {crise.note && <Text style={[styles.bandeauNote, { color: COULEURS.rougeTexte }]}>{crise.note}</Text>}
          </View>
        ))}

        {jour.lignes.map((ligne) => {
          const texte = texteLigne(ligne, repas)
          const photo = ligne.kind === 'event' && ligne.event.type === 'selle' && ligne.event.storage_path
          return (
            <View key={ligne.id} style={styles.ligne}>
              <View style={styles.ligneTexte}>
                <Text style={styles.ligneTitre}>
                  {texte.titre}
                  {photo ? '  (photo)' : ''}
                </Text>
                {texte.sousTitre && <Text style={styles.ligneSousTitre}>{texte.sousTitre}</Text>}
              </View>
              <Text style={styles.ligneHeure}>{texte.heure}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

type Props = {
  dog: Dog
  debut: string
  fin: string
  jours: Jour[]
  medicationsActives: DogMedication[]
  foodEntries: FoodEntry[]
  repas: SuiviEvent[]
  genereLe: string
}

/** Journal imprimable à remettre au vétérinaire, en PDF natif — indépendant
 * de la boîte de dialogue d'impression du navigateur (qui peut rester
 * bloquée sur certains appareils, notamment en PWA sur iOS). Reprend les
 * mêmes fonctions de mise en forme que le Journal (texteLigne, resumeJour…)
 * pour un contenu identique, juste posé sur une mise en page PDF plutôt que
 * sur les cartes de l'app. Les photos de selles sont signalées (« photo »)
 * mais pas incluses : à consulter dans l'app. Les emojis de l'app sont
 * volontairement absents — la police PDF standard ne les rend pas. */
export default function JournalPdf({ dog, debut, fin, jours, medicationsActives, foodEntries, repas, genereLe }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <PdfLogo />
        <Text style={styles.titre}>{dog.name} — Journal de suivi</Text>
        <Text style={styles.sousTitre}>
          Entéropathie chronique · du {formatShortDate(debut)} au {formatShortDate(fin)} · généré le {genereLe}
        </Text>

        <View style={[styles.section, styles.carteBlanche]} wrap={false}>
          <Text style={styles.sectionTitre}>Fiche</Text>
          <View style={styles.ficheGrille}>
            <ChampFiche terme="Race" valeur={dog.race} />
            <ChampFiche
              terme="Âge"
              valeur={dog.date_naissance ? `${calculerAge(dog.date_naissance)} ans` : null}
            />
            <ChampFiche terme="Puce / tatouage" valeur={dog.identification} />
            <ChampFiche terme="Poids actuel" valeur={dog.poids_actuel !== null ? `${dog.poids_actuel} kg` : null} />
            <ChampFiche terme="Poids idéal" valeur={dog.poids_ideal !== null ? `${dog.poids_ideal} kg` : null} />
            <ChampFiche
              terme="BCS"
              valeur={dog.bcs !== null ? `${dog.bcs}/9 — ${BCS_SCALE.find((b) => b.value === dog.bcs)?.label}` : null}
            />
            <ChampFiche
              terme="Diagnostic"
              valeur={dog.date_diagnostic ? formatLongDate(dog.date_diagnostic) : null}
            />
          </View>
        </View>

        <View style={[styles.section, styles.carteBlanche]} wrap={false}>
          <Text style={styles.sectionTitre}>Traitements en cours</Text>
          {medicationsActives.length === 0 ? (
            <Text style={styles.videTexte}>Aucun médicament actif.</Text>
          ) : (
            medicationsActives.map((m) => (
              <View key={m.id} style={styles.medLigne}>
                <Text style={styles.medNom}>
                  {m.nom_medicament}
                  {m.dose ? <Text style={styles.medDose}> · {m.dose}</Text> : null}
                </Text>
                {m.heure_prise && <Text style={styles.medHeure}>{formatTime(m.heure_prise)}</Text>}
              </View>
            ))
          )}
        </View>

        {foodEntries.length > 0 && (
          <View style={[styles.section, styles.carteBlanche]} wrap={false}>
            <Text style={styles.sectionTitre}>Alimentation</Text>
            {foodEntries.map((entry, i) => {
              const actuel = i === 0
              const finRegime = actuel ? null : veilleDe(foodEntries[i - 1].date_debut)
              return (
                <View key={entry.id} style={{ marginBottom: i === foodEntries.length - 1 ? 0 : 6 }}>
                  <Text style={styles.alimNom}>
                    {[entry.marque, entry.reference].filter(Boolean).join(' — ') || 'Aliment'}
                    {actuel && <Text style={styles.alimActuel}>(actuel)</Text>}
                  </Text>
                  <Text style={styles.alimPeriode}>
                    {actuel
                      ? `Depuis le ${formatShortDate(entry.date_debut)}`
                      : `Du ${formatShortDate(entry.date_debut)} au ${formatShortDate(finRegime!)}`}
                    {entry.quantite_jour && ` · ${entry.quantite_jour} / jour`}
                  </Text>
                  {entry.note && <Text style={styles.alimNote}>{entry.note}</Text>}
                </View>
              )
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitre, { marginBottom: 8 }]}>Journal chronologique</Text>
          {jours.length === 0 ? (
            <View style={styles.carteBlanche}>
              <Text style={styles.videTexte}>Aucune saisie sur cette période.</Text>
            </View>
          ) : (
            jours.map((jour) => <JourBloc key={jour.date} jour={jour} repas={repas} />)
          )}
        </View>

        <Text style={styles.pied} fixed>
          Document généré depuis appeic. Les données sont déclaratives.
        </Text>
      </Page>
    </Document>
  )
}
