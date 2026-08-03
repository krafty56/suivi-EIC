// Crée une session Stripe Checkout pour l'utilisateur connecté et renvoie
// son URL : le client redirige simplement dessus (window.location.href),
// aucun SDK Stripe côté app.
//
// Secrets requis (Dashboard > Edge Functions > create-checkout-session >
// Secrets) : STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL,
// STRIPE_PRICE_LIFETIME (ids de prix créés dans le Dashboard Stripe).
// SUPABASE_URL et SUPABASE_ANON_KEY sont déjà fournis automatiquement.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

type Plan = 'monthly' | 'annual' | 'lifetime'

const PRICE_IDS: Record<Plan, string | undefined> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  annual: Deno.env.get('STRIPE_PRICE_ANNUAL'),
  lifetime: Deno.env.get('STRIPE_PRICE_LIFETIME'),
}

// Appelée depuis le navigateur (contrairement à stripe-webhook, qui n'est
// appelée que par Stripe) : sans ces en-têtes, le préflight OPTIONS échoue
// et supabase-js ne voit qu'une erreur réseau générique.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })

  // Client au nom de l'appelant (pas service_role) : auth.getUser() vérifie
  // le jeton et échoue proprement s'il est invalide ou expiré.
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  const { plan, origin } = (await req.json()) as { plan: Plan; origin: string }
  const priceId = PRICE_IDS[plan]
  if (!priceId) return new Response('Offre inconnue', { status: 400, headers: CORS_HEADERS })

  const session = await stripe.checkout.sessions.create({
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userData.user.id,
    customer_email: userData.user.email,
    success_url: `${origin}/?premium=success`,
    cancel_url: `${origin}/?premium=annule`,
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
