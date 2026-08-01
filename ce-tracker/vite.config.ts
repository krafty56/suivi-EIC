import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // L'intégration Supabase de Vercel nomme ses variables NEXT_PUBLIC_*. On les
  // expose au même titre que VITE_*, ce qui évite de dupliquer la configuration.
  // Les secrets de l'intégration (SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PASSWORD,
  // SUPABASE_JWT_SECRET) n'ont aucun de ces deux préfixes : ils restent hors du bundle.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
