// Rappels par notification push : rendez-vous du lendemain, prises de
// médicament à l'heure programmée, échéances du carnet de santé (vaccins,
// antiparasitaires) du lendemain, et rappel hebdomadaire de qualité de vie
// chaque dimanche à 20h. Appelée toutes les dix minutes par la tâche
// pg_cron « send-reminders » (voir la migration
// 20260801280000_push_notifications.sql).
//
// Fuseau horaire : l'application n'a qu'un seul foyer d'utilisation, fixé en
// dur sur Europe/Paris faute de préférence de fuseau enregistrée par chien.
//
// Secrets requis (Dashboard > Edge Functions > send-reminders > Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — générés une fois, indépendants des
//   clés Supabase. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont déjà
//   fournis automatiquement à toute fonction Edge.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails('mailto:appeic@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const FUSEAU = 'Europe/Paris'
const FENETRE_MINUTES = 10 // aligné sur la fréquence de la tâche cron

function maintenantLocal(): { date: string; heure: string } {
  const formatteur = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parties = Object.fromEntries(formatteur.formatToParts(new Date()).map((p) => [p.type, p.value]))
  return { date: `${parties.year}-${parties.month}-${parties.day}`, heure: `${parties.hour}:${parties.minute}` }
}

function demainLocal(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type Payload = { titre: string; corps: string; url: string }

async function envoyer(dogId: string, payload: Payload) {
  const { data: abonnements } = await supabase.from('push_subscriptions').select('*').eq('dog_id', dogId)

  for (const abo of abonnements ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        JSON.stringify(payload),
      )
    } catch (err) {
      // Abonnement expiré ou révoqué côté navigateur : on le retire plutôt
      // que de réessayer indéfiniment à chaque passage de la tâche.
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', abo.id)
      }
    }
  }
}

Deno.serve(async () => {
  const { date: aujourdhui, heure } = maintenantLocal()
  const demain = demainLocal(aujourdhui)

  // Rendez-vous du lendemain, pas encore notifiés.
  const { data: rendezVous } = await supabase
    .from('appointments')
    .select('*')
    .eq('date', demain)
    .is('notified_at', null)

  for (const rdv of rendezVous ?? []) {
    await envoyer(rdv.dog_id, {
      titre: 'Rendez-vous demain',
      corps: `${rdv.motif}${rdv.heure ? ` à ${String(rdv.heure).slice(0, 5)}` : ''}${
        rdv.clinique ? ` — ${rdv.clinique}` : ''
      }`,
      url: '/',
    })
    await supabase.from('appointments').update({ notified_at: new Date().toISOString() }).eq('id', rdv.id)
  }

  // Médicaments dont l'heure programmée vient de passer, dans la fenêtre de
  // la tâche planifiée, pas encore notifiés aujourd'hui.
  const { data: medicaments } = await supabase
    .from('dog_medications')
    .select('*')
    .eq('actif', true)
    .not('heure_prise', 'is', null)

  for (const med of medicaments ?? []) {
    if (med.derniere_notification === aujourdhui) continue

    const heurePrise = String(med.heure_prise).slice(0, 5)
    const [hP, mP] = heurePrise.split(':').map(Number)
    const [hN, mN] = heure.split(':').map(Number)
    const ecartMinutes = hN * 60 + mN - (hP * 60 + mP)
    if (ecartMinutes < 0 || ecartMinutes >= FENETRE_MINUTES) continue

    await envoyer(med.dog_id, {
      titre: 'Médicament à donner',
      corps: `${med.nom_medicament}${med.dose ? ` — ${med.dose}` : ''}`,
      url: '/',
    })
    await supabase.from('dog_medications').update({ derniere_notification: aujourdhui }).eq('id', med.id)
  }

  // Échéances du carnet de santé (vaccins, antiparasitaires) tombant demain,
  // pas encore notifiées. prochaine_echeance est calculée en base à partir
  // de rappel_valeur/rappel_unite.
  const { data: echeances } = await supabase
    .from('carnet_sante')
    .select('*')
    .eq('prochaine_echeance', demain)
    .is('notified_at', null)

  for (const entree of echeances ?? []) {
    await envoyer(entree.dog_id, {
      titre: 'Rappel santé demain',
      corps: entree.nom,
      url: '/',
    })
    await supabase.from('carnet_sante').update({ notified_at: new Date().toISOString() }).eq('id', entree.id)
  }

  // Rappel hebdomadaire de qualité de vie, chaque dimanche à 20h (fenêtre de
  // la tâche planifiée), pas encore envoyé cette semaine. Porté par le
  // chien plutôt que par une ligne à part : ce rappel n'est lié à aucune
  // entité précise, contrairement aux autres rappels ci-dessus.
  const HEURE_RAPPEL_QDV_MINUTES = 20 * 60 // 20:00
  const estDimanche = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay() === 0

  if (estDimanche) {
    const [hN, mN] = heure.split(':').map(Number)
    const ecartMinutes = hN * 60 + mN - HEURE_RAPPEL_QDV_MINUTES
    if (ecartMinutes >= 0 && ecartMinutes < FENETRE_MINUTES) {
      const { data: chiens } = await supabase.from('dogs').select('id, name, dernier_rappel_qualite_vie')

      for (const chien of chiens ?? []) {
        if (chien.dernier_rappel_qualite_vie === aujourdhui) continue

        await envoyer(chien.id, {
          titre: 'Qualité de vie',
          corps: `Comment était ${chien.name} cette semaine ?`,
          url: '/',
        })
        await supabase.from('dogs').update({ dernier_rappel_qualite_vie: aujourdhui }).eq('id', chien.id)
      }
    }
  }

  return new Response('ok')
})
