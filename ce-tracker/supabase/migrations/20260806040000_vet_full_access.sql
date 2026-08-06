-- Accès vétérinaire complet : le lien de partage donnait jusqu'ici un
-- résumé sur un écran dédié (get_shared_dossier). Le vétérinaire doit
-- maintenant naviguer dans la même application que le propriétaire, en
-- lecture seule, avec une seule exception : ajouter un compte rendu dans
-- l'onglet Labo.
--
-- Mécanique : le lien fait passer le navigateur du vétérinaire par une
-- connexion anonyme Supabase (signInAnonymously — doit être activée dans
-- Authentication > Settings du projet). redeem_vet_share() vérifie le
-- jeton puis enregistre cette identité anonyme dans vet_share_grants, sans
-- jamais exposer owner_id. Toutes les tables du dossier reçoivent ensuite
-- une politique RLS supplémentaire, purement additive, qui autorise la
-- lecture quand cette identité a un accès actif au chien concerné —
-- vérifié en direct contre vet_shares (revoked_at / expires_at) à chaque
-- requête, pas seulement au moment de la connexion.

-- --------------------------------------------------------- vet_share_grants
create table if not exists public.vet_share_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  share_id uuid not null references public.vet_shares (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- RLS activée sans aucune politique : ni lu ni modifiable directement par
-- un client, seule redeem_vet_share() (security definer) y touche.
alter table public.vet_share_grants enable row level security;

-- ------------------------------------------------------- redeem_vet_share
create or replace function public.redeem_vet_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share record;
begin
  select id, dog_id into v_share
  from vet_shares
  where token = p_token
    and revoked_at is null
    and expires_at > now();

  if v_share.id is null then
    raise exception 'Lien invalide, expiré ou révoqué.';
  end if;

  insert into vet_share_grants (user_id, share_id, dog_id)
  values (auth.uid(), v_share.id, v_share.dog_id)
  on conflict (user_id) do update
    set share_id = excluded.share_id, dog_id = excluded.dog_id, granted_at = now();

  return v_share.dog_id;
end;
$$;

revoke all on function public.redeem_vet_share(text) from public;
-- authenticated uniquement : une connexion anonyme a ce rôle, mais un
-- appel sans identité (anon pur) n'aurait pas d'auth.uid() à enregistrer.
grant execute on function public.redeem_vet_share(text) to authenticated;

-- ------------------------------------------------------------ vet_has_access
-- Centralise le contrôle (jointure + expiration + révocation) pour éviter
-- de le dupliquer dans chaque politique RLS. Security definer : sans ça,
-- l'appelant n'aurait pas non plus le droit de lire vet_share_grants.
create or replace function public.vet_has_access(p_dog_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from vet_share_grants g
    join vet_shares s on s.id = g.share_id
    where g.dog_id = p_dog_id
      and g.user_id = auth.uid()
      and s.revoked_at is null
      and s.expires_at > now()
  );
$$;

revoke all on function public.vet_has_access(uuid) from public;
grant execute on function public.vet_has_access(uuid) to authenticated;

-- ---------------------------------------------------- lecture seule (SELECT)
create policy "dogs_vet_select" on public.dogs
  for select to authenticated
  using (public.vet_has_access(id));

create policy "dog_medications_vet_select" on public.dog_medications
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "daily_entries_vet_select" on public.daily_entries
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "medication_logs_vet_select" on public.medication_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.daily_entries e
      where e.id = daily_entry_id and public.vet_has_access(e.dog_id)
    )
  );

create policy "crises_vet_select" on public.crises
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "food_entries_vet_select" on public.food_entries
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "events_vet_select" on public.events
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "qualite_vie_vet_select" on public.qualite_vie
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "lab_values_vet_select" on public.lab_values
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "appointments_vet_select" on public.appointments
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "carnet_sante_vet_select" on public.carnet_sante
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "weights_vet_select" on public.weights
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "clinical_scores_vet_select" on public.clinical_scores
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "veterinaires_vet_select" on public.veterinaires
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "lab_reports_vet_select" on public.lab_reports
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "lab_report_folders_vet_select" on public.lab_report_folders
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "custom_entries_vet_select" on public.custom_entries
  for select to authenticated
  using (public.vet_has_access(dog_id));

create policy "absences_vet_select" on public.absences
  for select to authenticated
  using (public.vet_has_access(dog_id));

-- ------------------------------------------- seule écriture permise : ajouter
-- un compte rendu de labo (jamais modifier ni supprimer un existant).
create policy "lab_reports_vet_insert" on public.lab_reports
  for insert to authenticated
  with check (public.vet_has_access(dog_id));

drop policy if exists "lab_reports_vet_insert_storage" on storage.objects;
create policy "lab_reports_vet_insert_storage" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-reports'
    and public.vet_has_access(((storage.foldername(name))[1])::uuid)
  );

-- ------------------------------------------------------- nettoyage
-- Remplacée par la navigation complète ci-dessus : plus aucun code client
-- n'appelle get_shared_dossier.
drop function if exists public.get_shared_dossier(text);
