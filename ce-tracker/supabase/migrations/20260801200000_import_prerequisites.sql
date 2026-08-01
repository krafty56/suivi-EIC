-- Suivi EIC — préalables à l'import depuis l'application personnelle
--
-- Trois ajustements, actés avec le propriétaire avant exécution :
--   1. events.type accepte désormais 'activite' (promenades, trajets…), en plus
--      de symptome / selle / repas.
--   2. events gagne une colonne details en jsonb, pour les champs riches que le
--      modèle actuel ne représente pas (mucus, sang, volume des selles, durée
--      d'une promenade…) — rien n'est perdu, même ce qui n'a pas encore d'écran.
--   3. Une marque de lot d'import (import_batch) sur les tables concernées, pour
--      qu'un import raté s'annule d'une seule requête plutôt qu'à la main.

-- ------------------------------------------------------------ events.type
alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('symptome', 'selle', 'repas', 'activite'));

alter table public.events
  add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.events.details is
  'Champs riches sans colonne dédiée : mucus, sang, volume, durée… Libre, non affiché aujourd''hui.';

-- ------------------------------------------------------------- import_batch
alter table public.events add column if not exists import_batch text;
alter table public.weights add column if not exists import_batch text;
alter table public.dog_medications add column if not exists import_batch text;

create index if not exists events_import_batch_idx on public.events (import_batch) where import_batch is not null;
create index if not exists weights_import_batch_idx on public.weights (import_batch) where import_batch is not null;
create index if not exists dog_medications_import_batch_idx on public.dog_medications (import_batch) where import_batch is not null;

-- ------------------------------------------------------------- lab_values
-- Résultats de laboratoire détaillés : un paramètre, une valeur, une unité, des
-- bornes de référence. Distinct de lab_reports (la photo du compte rendu) :
-- les comptes rendus importés n'ont pas de photo, seulement ces valeurs.
create table if not exists public.lab_values (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  lab_name text,
  parameter_key text not null,
  parameter_label text not null,
  category text,
  value numeric,
  value_text text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  flag text check (flag in ('low', 'normal', 'high', 'abnormal')),
  note text,
  import_batch text,
  created_at timestamptz not null default now()
);

create index if not exists lab_values_dog_date_idx on public.lab_values (dog_id, date desc);
create index if not exists lab_values_dog_param_idx on public.lab_values (dog_id, parameter_key, date desc);
create index if not exists lab_values_import_batch_idx on public.lab_values (import_batch) where import_batch is not null;

alter table public.lab_values enable row level security;

drop policy if exists "lab_values_owner_all" on public.lab_values;
create policy "lab_values_owner_all" on public.lab_values
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- ------------------------------------------ dossier partagé au vétérinaire
-- Ajoute les résultats de laboratoire détaillés. Le reste est inchangé.
create or replace function public.get_shared_dossier(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'dog', to_jsonb(d) - 'owner_id' - 'created_at' - 'saisie_rapide',
    'share', jsonb_build_object('expires_at', s.expires_at, 'clinic_email', s.clinic_email),
    'medications', coalesce((
      select jsonb_agg(to_jsonb(m) - 'dog_id' - 'import_batch' order by m.actif desc, m.heure_prise)
      from dog_medications m where m.dog_id = d.id), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) - 'dog_id' order by e.date desc)
      from daily_entries e where e.dog_id = d.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) - 'dog_id' - 'import_batch' order by ev.at desc)
      from events ev where ev.dog_id = d.id), '[]'::jsonb),
    'crises', coalesce((
      select jsonb_agg(to_jsonb(c) - 'dog_id' order by c.date desc)
      from crises c where c.dog_id = d.id), '[]'::jsonb),
    'lab_reports', coalesce((
      select jsonb_agg(to_jsonb(l) - 'dog_id' order by l.date desc)
      from lab_reports l where l.dog_id = d.id), '[]'::jsonb),
    'lab_values', coalesce((
      select jsonb_agg(to_jsonb(lv) - 'dog_id' - 'import_batch' order by lv.date desc)
      from lab_values lv where lv.dog_id = d.id), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(to_jsonb(w) - 'dog_id' - 'import_batch' order by w.date desc)
      from weights w where w.dog_id = d.id), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(to_jsonb(sc) - 'dog_id' order by sc.date desc)
      from clinical_scores sc where sc.dog_id = d.id), '[]'::jsonb)
  )
  from vet_shares s
  join dogs d on d.id = s.dog_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now();
$$;

revoke all on function public.get_shared_dossier(text) from public;
grant execute on function public.get_shared_dossier(text) to anon, authenticated;
