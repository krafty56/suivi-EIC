-- Un médicament coché dans la checklist du jour (medication_logs) ne créait
-- jamais l'événement horodaté correspondant — seule la fiche Traitement
-- dédiée le faisait. Il restait donc invisible dans la liste du jour et le
-- journal, malgré la coche. Ce comblement est ponctuel : désormais l'app crée
-- l'événement elle-même à chaque coche (voir SaisirHubScreen).
--
-- Backfill pour les journées déjà saisies : une prise cochée sans événement
-- « traitement » ce jour-là en reçoit un, à l'heure habituelle du médicament
-- (heure_prise) ou à midi si elle n'est pas renseignée — comme les pesées
-- sans heure connue. Interprétée en heure de Paris, comme partout ailleurs
-- dans l'app (dates et heures y sont toujours saisies et affichées en local).
insert into public.events (dog_id, at, type, nom, categorie, intensite, dog_medication_id)
select
  de.dog_id,
  (de.date + coalesce(dm.heure_prise, time '12:00')) at time zone 'Europe/Paris',
  'traitement',
  dm.nom_medicament,
  null,
  null,
  dm.id
from public.medication_logs ml
join public.daily_entries de on de.id = ml.daily_entry_id
join public.dog_medications dm on dm.id = ml.dog_medication_id
where ml.pris = true
  and not exists (
    select 1 from public.events ev
    where ev.dog_id = de.dog_id
      and ev.type = 'traitement'
      and ev.dog_medication_id = dm.id
      and ev.at >= (de.date::timestamp at time zone 'Europe/Paris')
      and ev.at < ((de.date + 1)::timestamp at time zone 'Europe/Paris')
  );
