-- Suivi EIC — Phase 2 : partage vétérinaire et comptes rendus de labo
-- Aucune des six tables de la phase 1 n'est modifiée : ce sont deux ajouts.

-- ----------------------------------------------------------- vet_shares
-- Un lien de partage lecture seule. Le jeton est tiré au sort par Postgres :
-- 24 octets, soit 48 caractères hexadécimaux, impossibles à deviner.
create table if not exists public.vet_shares (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  clinic_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz
);

create index if not exists vet_shares_dog_idx on public.vet_shares (dog_id, created_at desc);

-- ---------------------------------------------------------- lab_reports
-- La photo elle-même vit dans le bucket Storage « lab-reports » ;
-- storage_path pointe dessus, sous la forme <dog_id>/<uuid>.<ext>.
create table if not exists public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  storage_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lab_reports_dog_date_idx on public.lab_reports (dog_id, date desc);

-- ------------------------------------------------------------------ RLS
alter table public.vet_shares enable row level security;
alter table public.lab_reports enable row level security;

drop policy if exists "vet_shares_owner_all" on public.vet_shares;
create policy "vet_shares_owner_all" on public.vet_shares
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

drop policy if exists "lab_reports_owner_all" on public.lab_reports;
create policy "lab_reports_owner_all" on public.lab_reports
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- -------------------------------------------------------- bucket Storage
-- Lecture publique, mais chemins en UUID : une photo n'est atteignable que
-- par quelqu'un qui en connaît déjà l'URL exacte.
insert into storage.buckets (id, name, public)
values ('lab-reports', 'lab-reports', true)
on conflict (id) do update set public = true;

drop policy if exists "lab_reports_owner_insert" on storage.objects;
create policy "lab_reports_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-reports'
    and exists (
      select 1 from public.dogs d
      where d.id::text = (storage.foldername(name))[1] and d.owner_id = auth.uid()
    )
  );

drop policy if exists "lab_reports_owner_delete" on storage.objects;
create policy "lab_reports_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lab-reports'
    and exists (
      select 1 from public.dogs d
      where d.id::text = (storage.foldername(name))[1] and d.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------- lecture par le vétérinaire
-- Le vétérinaire n'a pas de compte. Plutôt que d'ouvrir les tables au rôle
-- anonyme, cette fonction vérifie le jeton puis renvoie le seul dossier
-- correspondant. Le propriétaire (owner_id) n'est jamais exposé.
create or replace function public.get_shared_dossier(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'dog', to_jsonb(d) - 'owner_id' - 'created_at',
    'share', jsonb_build_object('expires_at', s.expires_at, 'clinic_email', s.clinic_email),
    'medications', coalesce((
      select jsonb_agg(to_jsonb(m) - 'dog_id' order by m.actif desc, m.heure_prise)
      from dog_medications m where m.dog_id = d.id), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) - 'dog_id' order by e.date desc)
      from daily_entries e where e.dog_id = d.id), '[]'::jsonb),
    'crises', coalesce((
      select jsonb_agg(to_jsonb(c) - 'dog_id' order by c.date desc)
      from crises c where c.dog_id = d.id), '[]'::jsonb),
    'lab_reports', coalesce((
      select jsonb_agg(to_jsonb(l) - 'dog_id' order by l.date desc)
      from lab_reports l where l.dog_id = d.id), '[]'::jsonb)
  )
  from vet_shares s
  join dogs d on d.id = s.dog_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now();
$$;

revoke all on function public.get_shared_dossier(text) from public;
grant execute on function public.get_shared_dossier(text) to anon, authenticated;
