-- Suivi EIC — statut premium (RevenueCat)
--
-- Une ligne par utilisateur, tenue à jour par le webhook RevenueCat (fonction
-- Edge revenuecat-webhook) à chaque événement d'achat/renouvellement/expiration.
-- Aucune écriture cliente : seule la clé service_role (utilisée par la
-- fonction Edge) peut modifier cette table, RLS ne l'autorise qu'en lecture
-- pour son propre compte.
--
-- IMPORTANT avant d'exécuter cette migration :
--   1. Créer la fonction Edge revenuecat-webhook (code fourni séparément)
--      dans Dashboard > Edge Functions, avec le secret REVENUECAT_WEBHOOK_SECRET
--      (à définir aussi côté RevenueCat > Project settings > Webhooks, en
--      en-tête Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>).
--   2. Dans RevenueCat, pointer le webhook vers
--      https://eivutxlpdaegtxyfgrtk.supabase.co/functions/v1/revenuecat-webhook

create table if not exists public.premium_status (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  product_id text,
  expires_at timestamptz,
  revenuecat_app_user_id text,
  updated_at timestamptz not null default now()
);

alter table public.premium_status enable row level security;

drop policy if exists "premium_status_owner_select" on public.premium_status;
create policy "premium_status_owner_select" on public.premium_status
  for select to authenticated
  using (owner_id = auth.uid());

-- Le compte de développement reste premium le temps de brancher les achats,
-- pour ne pas se retrouver bloqué par ses propres verrous en cours de route.
insert into public.premium_status (owner_id, is_premium, product_id, updated_at)
select id, true, 'dev-owner', now()
from auth.users
where email = 'kr4fty@gmail.com'
on conflict (owner_id) do update set is_premium = true;
