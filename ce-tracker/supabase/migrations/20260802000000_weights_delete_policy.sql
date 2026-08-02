-- Historique : le propriétaire peut désormais supprimer une pesée saisie par
-- erreur depuis le journal. weights n'a jusqu'ici été qu'upserté (PoidsSheet),
-- jamais supprimé : rien ne garantit qu'une policy DELETE existe déjà.
-- Policy additive, sans nom connu à retirer : elle ne fait qu'ajouter le
-- droit s'il manquait, sans conflit s'il existait déjà sous un autre nom.
drop policy if exists "weights_owner_delete" on public.weights;
create policy "weights_owner_delete" on public.weights
  for delete to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
