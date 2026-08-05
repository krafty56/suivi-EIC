import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Identifie ce build de façon unique : le SHA du commit sur Vercel, sinon un
// horodatage en local. C'est ce que compare le bandeau de mise à jour de
// l'app pour détecter qu'une nouvelle version a été déployée pendant qu'une
// PWA reste ouverte en arrière-plan.
const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'write-version-file',
      writeBundle() {
        writeFileSync(
          resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ version: buildVersion }),
        )
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  // L'intégration Supabase de Vercel nomme ses variables NEXT_PUBLIC_*. On les
  // expose au même titre que VITE_*, ce qui évite de dupliquer la configuration.
  // Les secrets de l'intégration (SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PASSWORD,
  // SUPABASE_JWT_SECRET) n'ont aucun de ces deux préfixes : ils restent hors du bundle.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
