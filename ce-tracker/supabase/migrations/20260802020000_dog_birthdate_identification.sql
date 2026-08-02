-- Fiche du chien : la date de naissance remplace la saisie libre d'âge (qui
-- se périmait dès le lendemain), et un numéro d'identification (puce
-- électronique ou tatouage) s'ajoute pour le dossier vétérinaire.
alter table public.dogs add column if not exists date_naissance date;
alter table public.dogs add column if not exists identification text;

-- Estimation de départ à partir de l'âge existant, pour ne pas repartir d'un
-- champ vide : le propriétaire la corrige ensuite à la date exacte depuis la
-- fiche. Ne touche pas aux fiches qui ont déjà une date de naissance.
update public.dogs
set date_naissance = (current_date - (age || ' years')::interval)::date
where date_naissance is null and age is not null;
