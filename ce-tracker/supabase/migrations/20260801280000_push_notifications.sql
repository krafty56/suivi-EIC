-- Suivi EIC — rappels par notification push
--
-- Deux déclencheurs : un rendez-vous vétérinaire le lendemain, et une prise
-- de médicament à l'heure programmée. Une tâche planifiée (pg_cron) appelle
-- toutes les dix minutes la fonction Edge send-reminders, qui envoie ce qui
-- est dû et marque ce qui l'a été, pour ne jamais doubler un rappel.
--
-- IMPORTANT avant d'exécuter cette migration :
--   1. Créer la fonction Edge send-reminders (code fourni séparément) dans
--      Dashboard > Edge Functions, avec les secrets VAPID_PUBLIC_KEY et
--      VAPID_PRIVATE_KEY.
--   2. Remplacer <SERVICE_ROLE_KEY> ci-dessous par la clé service_role du
--      projet (Dashboard > Settings > API). Cette clé donne un accès complet
--      à la base : elle n'a de sens que parce que cron.job n'est lisible que
--      par le propriétaire du projet, mais restez-en conscient.

-- ------------------------------------------------------- push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_dog_idx on public.push_subscriptions (dog_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner_all" on public.push_subscriptions;
create policy "push_subscriptions_owner_all" on public.push_subscriptions
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- ------------------------------------------------------------- suivi d'envoi
alter table public.appointments add column if not exists notified_at timestamptz;
alter table public.dog_medications add column if not exists derniere_notification date;

-- --------------------------------------------------------------- tâche cron
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent : retire l'ancienne tâche si cette migration est rejouée.
select cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';

select cron.schedule(
  'send-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://eivutxlpdaegtxyfgrtk.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
