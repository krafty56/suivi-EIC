-- Périodes d'absence du propriétaire : les jours où aucun symptôme n'a pu
-- être observé, pour ne pas les confondre avec des jours réellement calmes
-- dans le journal, les graphiques d'Analyses, ou le dossier remis au
-- vétérinaire. Même forme que crises (date_debut requise, date_fin nulle
-- tant que l'absence est en cours).
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  date_debut date not null,
  date_fin date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists absences_dog_idx on public.absences (dog_id, date_debut desc);

alter table public.absences enable row level security;

drop policy if exists "absences_owner_all" on public.absences;
create policy "absences_owner_all" on public.absences
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- get_shared_dossier gagne les absences, pour que le vétérinaire voie aussi
-- les périodes non surveillées plutôt qu'un journal creux sans explication.
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
      select jsonb_agg(to_jsonb(c) - 'dog_id' order by c.date_debut desc)
      from crises c where c.dog_id = d.id), '[]'::jsonb),
    'absences', coalesce((
      select jsonb_agg(to_jsonb(a) - 'dog_id' order by a.date_debut desc)
      from absences a where a.dog_id = d.id), '[]'::jsonb),
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
      from clinical_scores sc where sc.dog_id = d.id), '[]'::jsonb),
    'food_entries', coalesce((
      select jsonb_agg(to_jsonb(f) - 'dog_id' order by f.date_debut desc)
      from food_entries f where f.dog_id = d.id), '[]'::jsonb)
  )
  from vet_shares s
  join dogs d on d.id = s.dog_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now();
$$;

revoke all on function public.get_shared_dossier(text) from public;
grant execute on function public.get_shared_dossier(text) to anon, authenticated;
