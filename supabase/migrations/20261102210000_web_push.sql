-- A device can only register, inspect or remove its own Web Push endpoint.
-- Never expose the endpoint or encryption keys to other accounts.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (length(p256dh) between 20 and 300),
  auth text not null check (length(auth) between 8 and 300),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy own_push_subscriptions on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

-- Server-only idempotency table; the frontend cannot read notification history.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, reminder_key)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
