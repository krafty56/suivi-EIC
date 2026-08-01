/**
 * Icônes de la barre d'onglets, dessinées à la main plutôt qu'importées d'une
 * bibliothèque : cinq glyphes ne justifient pas une dépendance.
 *
 * Toutes sont tracées sur une grille de 24, en `currentColor`, pour suivre la
 * couleur de l'onglet actif sans réglage supplémentaire. Elles sont décoratives :
 * le libellé sous l'icône porte déjà le sens, d'où l'aria-hidden.
 */

type Props = { className?: string }

function Glyph({ className = '', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

/** Toit et porte : le récapitulatif du jour, écran d'accueil. */
export function IconAccueil(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M4.2 11.2 12 4.4l7.8 6.8" />
      <path d="M6.4 9.6v9.2a1 1 0 0 0 1 1H16.6a1 1 0 0 0 1-1V9.6" />
      <path d="M10.2 19.8v-5.4h3.6v5.4" />
    </Glyph>
  )
}

/** Presse-papier coché : la journée que l'on remplit. */
export function IconSaisie(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M9 3.8h6a1 1 0 0 1 1 1V6H8V4.8a1 1 0 0 1 1-1Z" />
      <path d="M16 6h1.8A2.2 2.2 0 0 1 20 8.2v10.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 18.8V8.2A2.2 2.2 0 0 1 6.2 6H8" />
      <path d="m9.2 13.8 2 2 3.6-3.9" />
    </Glyph>
  )
}

/** Liste à puces : le journal, jour après jour. */
export function IconHistorique(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M9 6.2h11M9 12h11M9 17.8h11" />
      <circle cx="4.6" cy="6.2" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="17.8" r="1.15" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

/** Courbe sur deux axes : les analyses. */
export function IconAnalyses(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M4 4v14.8A1.2 1.2 0 0 0 5.2 20H20" />
      <path d="m7.4 15.6 3.4-4.2 3 2.6 5.4-7" />
    </Glyph>
  )
}

/** Fiole d'analyse : les comptes rendus de laboratoire. */
export function IconLabo(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M9.6 3.5v6a2 2 0 0 1-.28 1.02l-4.6 7.9A1.8 1.8 0 0 0 6.28 21h11.44a1.8 1.8 0 0 0 1.56-2.58l-4.6-7.9a2 2 0 0 1-.28-1.02v-6" />
      <path d="M8.6 3.5h6.8" />
      <path d="M7.1 15.4h9.8" />
    </Glyph>
  )
}

/** Calendrier à spirale : l'agenda des rendez-vous. */
export function IconAgenda(props: Props) {
  return (
    <Glyph {...props}>
      <rect x="4" y="5.4" width="16" height="14.6" rx="2" />
      <path d="M4 9.6h16" />
      <path d="M8 3.5v4M16 3.5v4" />
      <path d="M8 13.2h2.2M13.8 13.2H16M8 16.6h2.2M13.8 16.6H16" />
    </Glyph>
  )
}

/** Empreinte : la fiche du chien. Pleine, seule forme lisible à cette taille. */
export function IconChien(props: Props) {
  return (
    <Glyph {...props}>
      <ellipse cx="6.8" cy="9.4" rx="1.9" ry="2.4" fill="currentColor" stroke="none" />
      <ellipse cx="11" cy="7.3" rx="1.95" ry="2.5" fill="currentColor" stroke="none" />
      <ellipse cx="15.4" cy="8.6" rx="1.9" ry="2.4" fill="currentColor" stroke="none" />
      <ellipse cx="18.5" cy="12.3" rx="1.7" ry="2.1" fill="currentColor" stroke="none" />
      <ellipse cx="11.8" cy="16.9" rx="4.4" ry="3.6" fill="currentColor" stroke="none" />
    </Glyph>
  )
}
