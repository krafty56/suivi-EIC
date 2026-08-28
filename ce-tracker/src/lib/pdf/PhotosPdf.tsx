import { Document, Page, View, Text, StyleSheet, Svg, Rect, Image } from '@react-pdf/renderer'
import { COULEURS_PDF as COULEURS } from './couleursPdf'

export type PhotoPdfItem = {
  id: string
  /** Image déjà redimensionnée côté client (data URL JPEG) — null si la
   * photo n'a pas pu être récupérée (supprimée du stockage, réseau…), auquel
   * cas la vignette reste juste une case vide avec sa date et son score. */
  dataUrl: string | null
  date: string
  score: number | null
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9.5, fontFamily: 'Helvetica', color: COULEURS.encre },
  entete: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
  logoTexte: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  titre: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 3 },
  sousTitre: { fontSize: 9, color: COULEURS.slate600, marginBottom: 14 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  case: { width: '31%', marginBottom: 10 },
  vignette: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COULEURS.slate200,
    objectFit: 'cover',
    backgroundColor: COULEURS.slate100,
  },
  vignetteVide: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COULEURS.slate200,
    backgroundColor: COULEURS.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vignetteVideTexte: { fontSize: 7, color: COULEURS.slate500, textAlign: 'center', padding: 4 },
  legende: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  date: { fontSize: 7.5, color: COULEURS.slate600 },
  score: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COULEURS.brand700,
    backgroundColor: '#E4EAF1',
    borderRadius: 6,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },
  pied: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: COULEURS.slate400,
    textAlign: 'center',
  },
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

type Props = {
  dogName: string
  periodeLabel: string
  photos: PhotoPdfItem[]
  genereLe: string
}

/** Galerie de photos de selles en PDF, avec date et score fécal — pour
 * repasser en revue une période avec le vétérinaire sans dépendre de
 * l'application. Les images sont déjà redimensionnées côté client avant
 * d'arriver ici : les fichiers d'origine (résolution appareil photo) sont
 * bien trop lourds pour une grille de vignettes. */
export default function PhotosPdf({ dogName, periodeLabel, photos, genereLe }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <PdfLogo />
        <Text style={styles.titre}>{dogName} — Galerie de selles</Text>
        <Text style={styles.sousTitre}>
          {periodeLabel} · {photos.length} photo{photos.length > 1 ? 's' : ''} · généré le {genereLe}
        </Text>

        <View style={styles.grille}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.case} wrap={false}>
              {photo.dataUrl ? (
                <Image src={photo.dataUrl} style={styles.vignette} />
              ) : (
                <View style={styles.vignetteVide}>
                  <Text style={styles.vignetteVideTexte}>Photo indisponible</Text>
                </View>
              )}
              <View style={styles.legende}>
                <Text style={styles.date}>{photo.date}</Text>
                {photo.score !== null && <Text style={styles.score}>{photo.score}/7</Text>}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.pied} fixed>
          Document généré depuis appeic. Les données sont déclaratives.
        </Text>
      </Page>
    </Document>
  )
}
