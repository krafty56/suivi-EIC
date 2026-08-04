import { useState } from 'react'
import { UNITES_LABO } from '../lib/labValues'
import { inputClass } from './ui'

/** Liste déroulante des unités courantes de laboratoire, avec une option
 * « Autre » qui bascule vers un champ libre — pour les unités hors liste
 * plutôt que de bloquer la saisie. */
export function UniteSelect({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [autre, setAutre] = useState(
    () => value !== null && value !== '' && !UNITES_LABO.includes(value),
  )

  return (
    <div>
      <select
        value={autre ? '__autre__' : (value ?? '')}
        onChange={(e) => {
          if (e.target.value === '__autre__') {
            setAutre(true)
            onChange('')
          } else {
            setAutre(false)
            onChange(e.target.value || null)
          }
        }}
        className={inputClass}
      >
        <option value="">Unité…</option>
        {UNITES_LABO.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value="__autre__">Autre…</option>
      </select>
      {autre && (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Unité"
          className={`${inputClass} mt-2`}
        />
      )}
    </div>
  )
}
