-- Règle personnelle : positionne l'état actuel du chien entre son pire
-- épisode connu et sa meilleure période connue, calculés à partir de ses
-- propres crises/périodes calmes une fois qu'il y en a assez en base. En
-- attendant (ou si les données manquent), le propriétaire peut déclarer ces
-- deux repères à la main — une ligne par chien, mise à jour en place plutôt
-- qu'un historique de versions.
create table if not exists public.reperes_personnels (
  dog_id uuid primary key references public.dogs (id) on delete cascade,
  pire_score_fecal integer not null check (pire_score_fecal between 1 and 7),
  pire_vomissements text not null check (pire_vomissements in ('jamais', 'parfois', 'souvent')),
  pire_traitement text,
  pire_alimentation text,
  meilleur_score_fecal integer not null check (meilleur_score_fecal between 1 and 7),
  meilleur_vomissements text not null check (meilleur_vomissements in ('jamais', 'parfois', 'souvent')),
  meilleur_traitement text,
  meilleur_alimentation text,
  updated_at timestamptz not null default now()
);

alter table public.reperes_personnels enable row level security;

drop policy if exists "reperes_personnels_owner_all" on public.reperes_personnels;
create policy "reperes_personnels_owner_all" on public.reperes_personnels
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- Même accès en lecture que le reste du dossier pour le vétérinaire via lien
-- de partage (voir 20260806040000_vet_full_access.sql).
create policy "reperes_personnels_vet_select" on public.reperes_personnels
  for select to authenticated
  using (public.vet_has_access(dog_id));
