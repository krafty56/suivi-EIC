-- Carnet de santé : historique des vaccins et antiparasitaires, avec un
-- rappel optionnel à échéance configurable (ex. « rappelle-moi dans 3 mois »),
-- exprimée en jours, semaines ou mois plutôt qu'une date fixe — le
-- propriétaire pense en délai depuis l'administration, pas en date future.
create table if not exists public.carnet_sante (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  type text not null check (type in ('vaccin', 'antiparasitaire', 'autre')),
  nom text not null,
  date_administration date not null,
  rappel_valeur integer check (rappel_valeur is null or rappel_valeur > 0),
  rappel_unite text check (rappel_unite in ('jours', 'semaines', 'mois')),
  -- Les deux champs du rappel vont ensemble ou ne servent à rien seuls.
  constraint rappel_complet check ((rappel_valeur is null) = (rappel_unite is null)),
  -- Calculée une fois pour toutes en base plutôt que recalculée à chaque
  -- lecture : sert aussi bien au tri de la liste qu'au job de rappel.
  -- make_interval() plutôt qu'un cast texte ('N days'::interval) : ce
  -- dernier passe par une fonction jugée non immuable par Postgres, rejetée
  -- dans une colonne générée (erreur 42P17).
  prochaine_echeance date generated always as (
    case
      when rappel_valeur is null or rappel_unite is null then null
      when rappel_unite = 'jours' then (date_administration + make_interval(days => rappel_valeur))::date
      when rappel_unite = 'semaines' then (date_administration + make_interval(weeks => rappel_valeur))::date
      when rappel_unite = 'mois' then (date_administration + make_interval(months => rappel_valeur))::date
    end
  ) stored,
  note text,
  -- Même logique que appointments.notified_at : un rappel poussé une fois,
  -- jamais répété pour la même échéance.
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists carnet_sante_dog_idx on public.carnet_sante (dog_id, date_administration desc);

alter table public.carnet_sante enable row level security;

drop policy if exists "carnet_sante_owner_all" on public.carnet_sante;
create policy "carnet_sante_owner_all" on public.carnet_sante
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
