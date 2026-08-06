-- Score de qualité de vie hebdomadaire : un ressenti global du propriétaire
-- (curseur 1 à 10), suivi dans le temps, distinct des symptômes cliniques
-- déjà tracés ailleurs — utile pour repérer une dégradation ou une
-- amélioration du quotidien que les seuls chiffres cliniques ne montrent
-- pas toujours. Fonctionnalité gratuite.
create table if not exists public.qualite_vie (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  score integer not null check (score between 1 and 10),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists qualite_vie_dog_idx on public.qualite_vie (dog_id, date desc);

alter table public.qualite_vie enable row level security;

drop policy if exists "qualite_vie_owner_all" on public.qualite_vie;
create policy "qualite_vie_owner_all" on public.qualite_vie
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- Suivi du dernier rappel hebdomadaire envoyé, pour ne le pousser qu'une
-- fois par dimanche — même logique que appointments.notified_at et
-- dog_medications.derniere_notification, mais porté par le chien plutôt
-- que par une ligne de rendez-vous ou de traitement puisque ce rappel
-- n'est lié à aucune entité précise.
alter table public.dogs add column if not exists dernier_rappel_qualite_vie date;
