import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <section
      onClick={onClick}
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

// min-w-0 est nécessaire pour type="date" : sans lui, un input[type=date]
// garde sa largeur de contenu intrinsèque (texte de la date + icône native)
// et déborde de son conteneur au lieu de respecter w-full, surtout visible
// sur iOS Safari selon la largeur d'écran et la taille de texte système.
export const inputClass =
  'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}) {
  const variants = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300',
    secondary: 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50',
    danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-3 text-center font-semibold transition-colors disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Sélecteur à 3 états utilisé pour l'appétit et l'énergie. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T | null) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : option.value)}
            className={`rounded-xl px-2 py-3 text-sm font-semibold transition-colors ${
              selected
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Feuille modale remontant du bas de l'écran (sélecteur de symptôme, crise). */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100"
          >
            &times;
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
      {children}
    </p>
  )
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{label}</p>
}
