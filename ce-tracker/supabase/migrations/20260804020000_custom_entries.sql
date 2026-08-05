-- Entrées personnalisées : un propriétaire peut ajouter un nom et un emoji
-- de son choix pour suivre un signe qui n'est dans aucune liste prédéfinie.
-- Propre au chien concerné (donc à son propriétaire, via dogs.owner_id) —
-- jamais partagée avec le reste de l'app, à l'inverse du catalogue de
-- symptômes qui vit dans le code (data/symptomes.ts).
create table if not exists public.custom_entries (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  nom text not null,
  emoji text not null,
  -- Pas de graduation pour l'instant : juste un nom et un emoji, comme
  -- demandé. La colonne existe déjà pour ne pas devoir remigrer le jour où
  -- une échelle 1-3 devient utile pour une entrée personnalisée.
  echelle boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists custom_entries_dog_nom_idx on public.custom_entries (dog_id, nom);

alter table public.custom_entries enable row level security;

drop policy if exists "custom_entries_owner_all" on public.custom_entries;
create policy "custom_entries_owner_all" on public.custom_entries
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
