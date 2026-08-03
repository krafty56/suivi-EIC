// Webhook Stripe : synchronise premium_status à l'achat, au renouvellement
// et à la résiliation.
//
// checkout.session.completed référence notre utilisateur via
// client_reference_id (posé par create-checkout-session) ; les événements
// d'abonnement suivants (updated/deleted) ne référencent que le client
// Stripe (customer), d'où le besoin de retrouver la ligne par
// stripe_customer_id plutôt que par owner_id.
//
// Secrets requis (Dashboard > Edge Functions > stripe-webhook > Secrets) :
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Stripe > Developers > Webhooks
//   > Signing secret). SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont déjà
//   fournis automatiquement.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, WEBHOOK_SECRET)
  } catch (err) {
    return new Response(`Signature invalide : ${(err as Error).message}`, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const ownerId = session.client_reference_id
      if (!ownerId) break
      const estAVie = session.mode === 'payment'
      const { error } = await supabase.from('premium_status').upsert({
        owner_id: ownerId,
        is_premium: true,
        product_id: estAVie ? 'lifetime' : 'subscription',
        // Une expiration précise arrive juste après via
        // customer.subscription.updated ; à vie, elle reste nulle pour toujours.
        expires_at: null,
        stripe_customer_id: session.customer as string,
        updated_at: new Date().toISOString(),
      })
      if (error) return new Response(error.message, { status: 500 })
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const actif = sub.status === 'active' || sub.status === 'trialing'
      const { error } = await supabase
        .from('premium_status')
        .update({
          is_premium: actif,
          expires_at: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', sub.customer as string)
      if (error) return new Response(error.message, { status: 500 })
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const { error } = await supabase
        .from('premium_status')
        .update({ is_premium: false, updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', sub.customer as string)
      if (error) return new Response(error.message, { status: 500 })
      break
    }
  }

  return new Response('OK', { status: 200 })
})
