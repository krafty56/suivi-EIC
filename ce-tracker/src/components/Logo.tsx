/**
 * Marque appeic.
 *
 * Les barres ascendantes sont reproduites en SVG : elles sont géométriques,
 * donc fidèles. Le mot lui-même est composé typographiquement — la police du
 * logo d'origine n'étant pas dans le dépôt, c'est une approximation, à
 * remplacer par le fichier fourni dès qu'il sera disponible.
 */

export function Barres({ hauteur = 22 }: { hauteur?: number }) {
  return (
    <svg
      viewBox="0 0 30 24"
      height={hauteur}
      width={(hauteur * 30) / 24}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="14" width="6.4" height="10" rx="1.6" fill="#b4cded" />
      <rect x="9.4" y="7" width="6.4" height="17" rx="1.6" fill="#b4cded" />
      <rect x="18.8" y="0" width="6.4" height="24" rx="1.6" fill="#b4cded" />
    </svg>
  )
}

type Props = {
  /** Hauteur du mot en pixels. Les barres s'alignent dessus. */
  taille?: number
  /** Affiche « suivi des entéropathies chroniques » sous le mot. */
  baseline?: boolean
  className?: string
}

export default function Logo({ taille = 34, baseline = false, className = '' }: Props) {
  return (
    <div className={className}>
      <div className="flex items-end gap-2">
        <Barres hauteur={taille * 0.72} />
        <span
          className="font-extrabold tracking-tight"
          style={{ fontSize: taille, lineHeight: 0.92 }}
        >
          <span style={{ color: '#344966' }}>app</span>
          <span style={{ color: '#bfcc94' }}>eic</span>
        </span>
      </div>
      {baseline && (
        <p
          className="mt-1.5 font-bold tracking-tight text-slate-900"
          style={{ fontSize: Math.max(11, taille * 0.3) }}
        >
          suivi des entéropathies chroniques
        </p>
      )}
    </div>
  )
}
