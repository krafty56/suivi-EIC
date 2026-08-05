-- Une absence dépasse rarement 24h/24 (le propriétaire part au travail,
-- pas forcément toute la journée) : on affine avec un créneau horaire,
-- optionnel pour rester compatible avec les absences déjà enregistrées et
-- les cas où l'absence couvre bien des journées entières (week-end, voyage).
alter table public.absences
  add column if not exists heure_debut time,
  add column if not exists heure_fin time;
