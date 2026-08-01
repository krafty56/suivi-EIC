import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local',
  )
}

export const supabase = createClient(url, anonKey)
