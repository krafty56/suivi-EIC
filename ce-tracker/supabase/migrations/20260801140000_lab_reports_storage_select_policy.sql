-- Politique SELECT manquante sur le bucket lab-reports.
--
-- La suppression d'un objet Storage commence par le sélectionner : sans
-- politique SELECT, la sélection ne renvoyait rien, la suppression ne portait
-- sur aucun objet, et l'API répondait « [] » — un tableau vide, pas une erreur.
-- Le propriétaire croyait donc avoir supprimé un compte rendu alors que la
-- photo restait lisible à son URL publique.
--
-- Cette politique ne change rien à la lecture publique du bucket, qui ne passe
-- pas par storage.objects : elle n'ouvre l'énumération qu'au propriétaire, et
-- seulement pour les dossiers de ses propres chiens.

drop policy if exists "lab_reports_owner_select" on storage.objects;
create policy "lab_reports_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lab-reports'
    and (storage.foldername(name))[1] in (
      select d.id::text from public.dogs d where d.owner_id = auth.uid()
    )
  );
