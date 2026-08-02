-- Suivi alimentaire : une note libre pour le motif du changement ou la
-- réponse du chien (transit, appétence), comme pour crises.note et les
-- autres tables de l'app.
alter table public.food_entries add column if not exists note text;
