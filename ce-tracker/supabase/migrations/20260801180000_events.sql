-- Suivi EIC — journal d'événements horodatés
--
-- daily_entries enregistre un état par journée : un symptôme y est présent ou
-- absent. C'est insuffisant pour compter, donc pour toute statistique — trois
-- refluxs en deux heures et un reflux dans la journée y sont indistinguables.
-- Cette table enregistre chaque observation à l'heure où elle est faite.
--
-- daily_entries n'est pas supprimée : elle garde l'appétit, l'énergie, les
-- médicaments du jour et les notes, qui sont des jugements de fin de journée
-- et non des événements. Ses colonnes score_fecal, vomissements_count,
-- selles_count et symptoms restent en place pour les journées déjà saisies,
-- mais ne sont plus alimentées : ces observations passent par le journal.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('symptome', 'selle', 'repas')),
  nom text not null,
  categorie text,
  -- 1 à 3 pour un symptôme coté, 1 à 7 pour le score fécal d'une selle,
  -- vide pour un symptôme simplement constaté ou un repas.
  intensite smallint check (intensite between 1 and 7),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists events_dog_at_idx on public.events (dog_id, at desc);
create index if not exists events_dog_type_idx on public.events (dog_id, type, at desc);

alter table public.events enable row level security;

drop policy if exists "events_owner_all" on public.events;
create policy "events_owner_all" on public.events
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- ------------------------------------------------------------ saisie rapide
-- Les deux raccourcis de l'écran d'accueil, choisis par le propriétaire.
-- Tableau d'au plus deux entrées : { type, nom, categorie, echelle }.
alter table public.dogs
  add column if not exists saisie_rapide jsonb not null default '[]'::jsonb;

comment on column public.dogs.saisie_rapide is
  'Raccourcis de saisie rapide, deux au maximum, choisis parmi le catalogue.';

-- ------------------------------------------ dossier partagé au vétérinaire
-- Ajoute le journal. Le reste est inchangé.
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
      select jsonb_agg(to_jsonb(m) - 'dog_id' order by m.actif desc, m.heure_prise)
      from dog_medications m where m.dog_id = d.id), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) - 'dog_id' order by e.date desc)
      from daily_entries e where e.dog_id = d.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) - 'dog_id' order by ev.at desc)
      from events ev where ev.dog_id = d.id), '[]'::jsonb),
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
