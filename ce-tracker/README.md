# Suivi EIC — carnet de bord (Phase 1)

Application web de suivi quotidien pour un chien atteint d'entéropathie chronique.
Mobile-first : l'écran de référence est un téléphone, le desktop est secondaire.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase (Postgres, Auth)

## Mise en route

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Exécuter `supabase/schema.sql` dans le SQL Editor du projet (tables + Row Level Security).
3. Copier `.env.example` vers `.env.local` et renseigner l'URL du projet et la clé `anon`.
4. Installer et lancer :

```bash
npm install
npm run dev
```

Si vous ne voulez pas confirmer les adresses email pendant les tests, désactivez
« Confirm email » dans Authentication → Providers → Email du tableau de bord Supabase.

## Ce que couvre cette phase

1. Authentification propriétaire (email / mot de passe)
2. Fiche chien (création / édition)
3. Configuration des médicaments du chien
4. Saisie quotidienne
5. Signalement de crise
6. Historique chronologique

La table `food_entries` fait partie du modèle de données et est créée par le schéma,
mais aucun écran ne l'utilise dans cette phase.

## Structure

```
src/
  App.tsx                  coquille : session, chargement du chien, navigation par onglets
  components/ui.tsx        primitives partagées (Card, Field, Button, Sheet…)
  data/catalogs.ts         catalogues fixes : médicaments, symptômes, scores fécaux, BCS
  lib/supabase.ts          client Supabase
  lib/types.ts             types du modèle de données
  lib/date.ts              helpers de date
  screens/                 les écrans de l'application
supabase/schema.sql        schéma Postgres et politiques RLS
```
