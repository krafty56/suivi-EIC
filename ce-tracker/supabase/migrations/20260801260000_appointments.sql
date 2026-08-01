-- Suivi EIC — agenda des rendez-vous vétérinaires
--
-- Distinct des événements du journal : un rendez-vous se note à l'avance,
-- souvent avant que l'heure exacte soit connue, et reste utile après coup
-- comme trace (motif, clinique, ce qui en est ressorti en note).

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  heure time,
  motif text not null,
  clinique text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists appointments_dog_date_idx on public.appointments (dog_id, date);

alter table public.appointments enable row level security;

drop policy if exists "appointments_owner_all" on public.appointments;
create policy "appointments_owner_all" on public.appointments
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
