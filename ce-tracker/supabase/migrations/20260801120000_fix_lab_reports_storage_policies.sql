-- Correction des politiques Storage du bucket lab-reports.
--
-- La migration précédente écrivait la condition ainsi :
--
--   exists (select 1 from public.dogs d
--           where d.id::text = (storage.foldername(name))[1] and d.owner_id = auth.uid())
--
-- Le sous-select portant sur public.dogs, l'identifiant « name » y désignait
-- dogs.name — le nom du chien — et non storage.objects.name, le chemin du
-- fichier : Postgres résout d'abord dans le FROM le plus proche. La politique
-- comparait donc un identifiant de chien au dossier extrait de son propre nom.
--
-- Elle refusait tout envoi légitime, et un chien nommé « <son id>/x » aurait
-- satisfait la condition pour n'importe quel chemin, ouvrant l'écriture sur
-- l'ensemble du bucket.
--
-- Ici (storage.foldername(name))[1] est évalué à gauche du IN, donc hors du
-- sous-select : « name » ne peut plus désigner que storage.objects.name.

drop policy if exists "lab_reports_owner_insert" on storage.objects;
create policy "lab_reports_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-reports'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );

drop policy if exists "lab_reports_owner_delete" on storage.objects;
create policy "lab_reports_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lab-reports'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );
