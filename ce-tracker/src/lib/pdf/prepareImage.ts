/** Récupère une image distante et la redimensionne côté client en JPEG
 * compressé — les photos de selles sont stockées à la résolution d'origine
 * de l'appareil (plusieurs Mo), bien trop lourdes pour une grille de
 * vignettes PDF. Renvoie null si l'image est indisponible (supprimée du
 * stockage, réseau…) plutôt que de faire échouer tout l'export pour une
 * seule photo manquante. */
export async function redimensionnerPourPdf(url: string, tailleMax = 500): Promise<string | null> {
  try {
    const reponse = await fetch(url)
    if (!reponse.ok) return null
    const blob = await reponse.blob()
    const bitmap = await createImageBitmap(blob)
    const ratio = Math.min(1, tailleMax / Math.max(bitmap.width, bitmap.height))
    const largeur = Math.round(bitmap.width * ratio)
    const hauteur = Math.round(bitmap.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}
