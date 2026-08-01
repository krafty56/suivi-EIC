-- Suivi EIC — événements Traitement et Note libre
--
-- L'écran de saisie distinguait déjà symptôme / selle / repas / activité.
-- Deux natures d'observation restaient sans événement horodaté :
--   - la prise d'un médicament à un instant précis (jusqu'ici seulement un
--     « pris/pas pris » au niveau de la journée, dans daily_entries) ;
--   - une note libre, datée, indépendante d'un symptôme particulier.
--
-- dog_medication_id relie l'événement au traitement pris, quand il y en a
-- un : cela permettra plus tard des statistiques d'observance par molécule.
-- La checklist quotidienne existante n'est pas retirée ; les deux mécanismes
-- coexistent pour l'instant.

alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check
  check (type in ('symptome', 'selle', 'repas', 'activite', 'traitement', 'note'));

alter table public.events
  add column if not exists dog_medication_id uuid references public.dog_medications (id) on delete set null;

comment on column public.events.dog_medication_id is
  'Renseigné pour un événement de type traitement : le médicament pris.';
