-- Dossiers nommés par l'utilisateur pour ranger les comptes rendus de labo
-- (ex. « Médecine interne », « Imagerie »), plus un titre éditable par
-- compte rendu pour le renommer indépendamment du fichier stocké (dont le
-- chemin reste un UUID technique, invisible pour l'utilisateur).

create table if not exists public.lab_report_folders (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now()
);

create index if not exists lab_report_folders_dog_idx on public.lab_report_folders (dog_id);

alter table public.lab_report_folders enable row level security;

drop policy if exists "lab_report_folders_owner_all" on public.lab_report_folders;
create policy "lab_report_folders_owner_all" on public.lab_report_folders
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

alter table public.lab_reports
  add column if not exists folder_id uuid references public.lab_report_folders (id) on delete set null;

alter table public.lab_reports add column if not exists titre text;

create index if not exists lab_reports_folder_idx on public.lab_reports (folder_id);
