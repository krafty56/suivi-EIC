-- Carnet des vétérinaires/cliniques du chien : nom, téléphone, email — pour
-- appeler ou écrire en un tap depuis la fiche du chien.
create table if not exists public.veterinaires (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  nom text not null,
  telephone text,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists veterinaires_dog_idx on public.veterinaires (dog_id);

alter table public.veterinaires enable row level security;

drop policy if exists "veterinaires_owner_all" on public.veterinaires;
create policy "veterinaires_owner_all" on public.veterinaires
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
