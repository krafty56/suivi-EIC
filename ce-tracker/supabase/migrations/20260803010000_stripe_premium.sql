-- Suivi EIC — bascule du premium vers Stripe (paiement web) plutôt que
-- RevenueCat (achat in-app), pour rester en PWA sans passer par les stores.
--
-- premium_status existe déjà (migration 20260803000000) : is_premium,
-- product_id, expires_at, updated_at. On y ajoute juste de quoi retrouver un
-- utilisateur à partir des événements Stripe, qui référencent le client
-- Stripe (customer) plutôt que notre propre id.
--
-- IMPORTANT avant d'exécuter cette migration :
--   1. Créer les fonctions Edge create-checkout-session et stripe-webhook
--      (code fourni séparément) dans Dashboard > Edge Functions.
--   2. Secrets de create-checkout-session : STRIPE_SECRET_KEY,
--      STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_PRICE_LIFETIME.
--   3. Secrets de stripe-webhook : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
--   4. Dans Stripe, configurer le webhook vers
--      https://eivutxlpdaegtxyfgrtk.supabase.co/functions/v1/stripe-webhook
--      sur les événements checkout.session.completed,
--      customer.subscription.updated, customer.subscription.deleted.

alter table public.premium_status add column if not exists stripe_customer_id text;

create unique index if not exists premium_status_stripe_customer_idx
  on public.premium_status (stripe_customer_id)
  where stripe_customer_id is not null;
