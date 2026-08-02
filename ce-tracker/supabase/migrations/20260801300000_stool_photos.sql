-- Suivi EIC — photo à la saisie d'une selle
--
-- La photo vit dans le bucket Storage « stool-photos » ; events.storage_path
-- pointe dessus, sous la forme <dog_id>/<uuid>.<ext> — même convention que
-- lab-reports. Colonne générique sur events plutôt que sur un type dédié :
-- rien n'empêche un autre type d'événement d'en avoir besoin plus tard.
--
-- Les politiques Storage reprennent d'emblée la forme corrigée de
-- lab-reports (voir 20260801120000_fix_lab_reports_storage_policies.sql) :
-- (storage.foldername(name))[1] évalué hors du sous-select portant sur dogs,
-- pour que « name » ne désigne jamais que storage.objects.name. La politique
-- SELECT est incluse dès le départ — son absence initiale sur lab-reports
-- avait fait échouer les suppressions en silence.

alter table public.events add column if not exists storage_path text;

insert into storage.buckets (id, name, public)
values ('stool-photos', 'stool-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "stool_photos_owner_insert" on storage.objects;
create policy "stool_photos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stool-photos'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );

drop policy if exists "stool_photos_owner_select" on storage.objects;
create policy "stool_photos_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stool-photos'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );

drop policy if exists "stool_photos_owner_delete" on storage.objects;
create policy "stool_photos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stool-photos'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );
