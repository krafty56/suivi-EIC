-- Suivi EIC — schéma Phase 1
-- À exécuter dans le SQL Editor du projet Supabase.
-- Toutes les tables sont protégées par RLS : un propriétaire ne voit que ses propres chiens.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- dogs
create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  race text,
  age numeric,
  poids_actuel numeric,
  poids_ideal numeric,
  bcs smallint check (bcs between 1 and 9),
  date_diagnostic date,
  created_at timestamptz not null default now()
);

create index if not exists dogs_owner_id_idx on public.dogs (owner_id);

-- ------------------------------------------------------- dog_medications
create table if not exists public.dog_medications (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  nom_medicament text not null,
  dose text,
  heure_prise time,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists dog_medications_dog_id_idx on public.dog_medications (dog_id);

-- --------------------------------------------------------- daily_entries
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  score_fecal smallint check (score_fecal between 1 and 7),
  appetit text check (appetit in ('faible', 'normal', 'bon')),
  energie text check (energie in ('faible', 'normale', 'bonne')),
  vomissements_count integer not null default 0 check (vomissements_count >= 0),
  symptoms jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique (dog_id, date)
);

create index if not exists daily_entries_dog_date_idx on public.daily_entries (dog_id, date desc);

-- ------------------------------------------------------- medication_logs
create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  daily_entry_id uuid not null references public.daily_entries (id) on delete cascade,
  dog_medication_id uuid not null references public.dog_medications (id) on delete cascade,
  pris boolean not null default false,
  unique (daily_entry_id, dog_medication_id)
);

create index if not exists medication_logs_entry_idx on public.medication_logs (daily_entry_id);

-- ---------------------------------------------------------------- crises
create table if not exists public.crises (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  changements jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists crises_dog_date_idx on public.crises (dog_id, date desc);

-- ----------------------------------------------------------- food_entries
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date_debut date not null,
  marque text,
  reference text,
  quantite_jour text,
  created_at timestamptz not null default now()
);

create index if not exists food_entries_dog_idx on public.food_entries (dog_id, date_debut desc);

-- ------------------------------------------------------------------- RLS
alter table public.dogs enable row level security;
alter table public.dog_medications enable row level security;
alter table public.daily_entries enable row level security;
alter table public.medication_logs enable row level security;
alter table public.crises enable row level security;
alter table public.food_entries enable row level security;

-- dogs : accès limité au propriétaire authentifié
drop policy if exists "dogs_owner_all" on public.dogs;
create policy "dogs_owner_all" on public.dogs
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- tables rattachées à un chien : on remonte jusqu'au propriétaire
drop policy if exists "dog_medications_owner_all" on public.dog_medications;
create policy "dog_medications_owner_all" on public.dog_medications
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

drop policy if exists "daily_entries_owner_all" on public.daily_entries;
create policy "daily_entries_owner_all" on public.daily_entries
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

drop policy if exists "crises_owner_all" on public.crises;
create policy "crises_owner_all" on public.crises
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

drop policy if exists "food_entries_owner_all" on public.food_entries;
create policy "food_entries_owner_all" on public.food_entries
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- medication_logs : rattaché au chien via daily_entries
drop policy if exists "medication_logs_owner_all" on public.medication_logs;
create policy "medication_logs_owner_all" on public.medication_logs
  for all to authenticated
  using (
    exists (
      select 1
      from public.daily_entries e
      join public.dogs d on d.id = e.dog_id
      where e.id = daily_entry_id and d.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.daily_entries e
      join public.dogs d on d.id = e.dog_id
      where e.id = daily_entry_id and d.owner_id = auth.uid()
    )
  );
