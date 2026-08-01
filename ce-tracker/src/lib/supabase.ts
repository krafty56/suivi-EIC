import { createClient } from '@supabase/supabase-js'

// En local on renseigne VITE_* dans .env.local ; sur Vercel, l'intégration
// Supabase fournit déjà les mêmes valeurs sous les noms NEXT_PUBLIC_*.
const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ' +
      '(ou NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY) dans .env.local',
  )
}

export const supabase = createClient(url, anonKey)
