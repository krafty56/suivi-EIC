// Webhook RevenueCat : reçoit chaque événement d'achat/renouvellement/
// expiration et met à jour public.premium_status en conséquence.
//
// Suppose que le SDK RevenueCat (côté app, une fois Capacitor branché) est
// configuré avec l'id utilisateur Supabase comme appUserID — event.app_user_id
// correspond alors directement à owner_id.
//
// Secrets requis (Dashboard > Edge Functions > revenuecat-webhook > Secrets) :
//   REVENUECAT_WEBHOOK_SECRET — chaîne choisie ici, renseignée aussi côté
//   RevenueCat (Project settings > Webhooks > Authorization header, sous la
//   forme "Bearer <REVENUECAT_WEBHOOK_SECRET>"). SUPABASE_URL et
//   SUPABASE_SERVICE_ROLE_KEY sont déjà fournis automatiquement.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Événements qui mettent fin à l'accès, indépendamment de expiration_at_ms
// (une résiliation programmée — CANCELLATION — laisse l'accès actif jusqu'à
// l'échéance : seule EXPIRATION marque la fin effective).
const EVENEMENTS_FIN_ACCES = new Set(['EXPIRATION'])

type EvenementRevenueCat = {
  type: string
  app_user_id: string
  product_id?: string | null
  expiration_at_ms?: number | null
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { event } = (await req.json()) as { event: EvenementRevenueCat }
  if (!event?.app_user_id) {
    return new Response('Requête invalide : app_user_id manquant', { status: 400 })
  }

  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null
  const encoreValide = event.expiration_at_ms == null || event.expiration_at_ms > Date.now()
  const isPremium = !EVENEMENTS_FIN_ACCES.has(event.type) && encoreValide

  const { error } = await supabase.from('premium_status').upsert({
    owner_id: event.app_user_id,
    is_premium: isPremium,
    product_id: event.product_id ?? null,
    expires_at: expiresAt,
    revenuecat_app_user_id: event.app_user_id,
    updated_at: new Date().toISOString(),
  })

  if (error) return new Response(error.message, { status: 500 })
  return new Response('OK', { status: 200 })
})
