-- Suivi EIC — préalables aux indices CIBDAI et CCECAI
--
-- Ces indices demandent des données que l'application ne collectait pas :
--   perte de poids       -> il n'existait aucun historique, poids_actuel étant écrasé
--   fréquence des selles -> seulement un symptôme binaire, pas un nombre
--   albuminémie          -> présente dans les photos de labo, mais en image
-- Le barème de cotation lui-même n'est pas encore encodé : les items sont
-- stockés en jsonb, ce qui laisse la grille évoluer sans migration.

-- ------------------------------------------------------------------ poids
-- dogs.poids_actuel est conservé comme dernier poids connu, pratique à lire.
-- Cette table en porte l'historique ; la fiche écrit dans les deux.
create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  poids numeric not null check (poids > 0),
  created_at timestamptz not null default now(),
  unique (dog_id, date)
);

create index if not exists weights_dog_date_idx on public.weights (dog_id, date desc);

-- Amorce l'historique avec le poids déjà saisi, pour ne pas repartir de zéro.
insert into public.weights (dog_id, date, poids)
select id, coalesce(date_diagnostic, current_date), poids_actuel
from public.dogs
where poids_actuel is not null
on conflict (dog_id, date) do nothing;

-- ------------------------------------------------ fréquence de défécation
alter table public.daily_entries
  add column if not exists selles_count smallint check (selles_count >= 0);

comment on column public.daily_entries.selles_count is
  'Nombre de défécations sur la journée. Null = non renseigné, distinct de zéro.';

-- ------------------------------------------------------------ albuminémie
alter table public.lab_reports
  add column if not exists albumine numeric check (albumine >= 0);

comment on column public.lab_reports.albumine is
  'Albuminémie en g/L, saisie à la main depuis le compte rendu photographié.';

-- -------------------------------------------------------- clinical_scores
-- Le total et la sévérité sont figés à l'enregistrement : un score est une
-- observation datée, il ne doit pas changer rétroactivement si la grille
-- de cotation est corrigée plus tard.
create table if not exists public.clinical_scores (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date date not null,
  indice text not null check (indice in ('cibdai', 'ccecai')),
  items jsonb not null default '{}'::jsonb,
  total smallint not null check (total >= 0),
  severite text,
  note text,
  created_at timestamptz not null default now(),
  unique (dog_id, date, indice)
);

create index if not exists clinical_scores_dog_date_idx
  on public.clinical_scores (dog_id, date desc);

-- ------------------------------------------------------------------- RLS
alter table public.weights enable row level security;
alter table public.clinical_scores enable row level security;

drop policy if exists "weights_owner_all" on public.weights;
create policy "weights_owner_all" on public.weights
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

drop policy if exists "clinical_scores_owner_all" on public.clinical_scores;
create policy "clinical_scores_owner_all" on public.clinical_scores
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- ------------------------------------------ dossier partagé au vétérinaire
-- Ajoute la courbe de poids et les scores cliniques. Le reste est inchangé.
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
      from lab_reports l where l.dog_id = d.id), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(to_jsonb(w) - 'dog_id' order by w.date desc)
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
