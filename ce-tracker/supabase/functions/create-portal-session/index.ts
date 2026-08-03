// Ouvre le portail client Stripe pour l'utilisateur premium connecté :
// changer de formule, mettre à jour le moyen de paiement, résilier. Renvoie
// l'URL du portail, le client redirige simplement dessus.
//
// Secrets requis : STRIPE_SECRET_KEY. SUPABASE_URL et SUPABASE_ANON_KEY sont
// déjà fournis automatiquement.
//
// Le portail lui-même (formules proposées au changement, etc.) se configure
// dans Stripe > Paramètres > Facturation > Portail client, pas ici.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  const { data: statut } = await supabase
    .from('premium_status')
    .select('stripe_customer_id')
    .eq('owner_id', userData.user.id)
    .maybeSingle()

  if (!statut?.stripe_customer_id) {
    return new Response('Aucun abonnement Stripe associé à ce compte', {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const { origin } = (await req.json()) as { origin: string }

  const session = await stripe.billingPortal.sessions.create({
    customer: statut.stripe_customer_id,
    return_url: `${origin}/`,
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
