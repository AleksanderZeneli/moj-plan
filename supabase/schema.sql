-- Uruchom raz w Supabase SQL Editor.
-- Wszystkie prywatne rekordy są chronione przez Row Level Security.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wat_group text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null check (kind in ('university','personal')),
  subject text not null default '',
  date date not null,
  start_time time not null,
  end_time time not null,
  location text not null default '',
  recurrence text not null default 'none' check (recurrence in ('none','weekly')),
  created_at timestamptz not null default now(),
  constraint event_time_order check (end_time > start_time)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  due_date date,
  completed boolean not null default false,
  recurrence text not null default 'none' check (recurrence in ('none','daily')),
  last_completed_on date,
  priority text not null default 'normal' check (priority in ('normal','high')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 200),
  next_date date not null,
  repeat_weekly boolean not null default true,
  preparation text not null default '',
  remind_days integer not null default 7 check (remind_days between 1 and 30),
  reviewed_for_date date,
  created_at timestamptz not null default now()
);

create index if not exists events_user_date_idx on public.events (user_id,date);
create index if not exists tasks_user_due_idx on public.tasks (user_id,due_date);
create index if not exists labs_user_next_idx on public.labs (user_id,next_date);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.labs enable row level security;

-- Jedna polityka na tabelę obejmuje SELECT, INSERT, UPDATE i DELETE.
drop policy if exists own_profiles on public.profiles;
create policy own_profiles on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_events on public.events;
create policy own_events on public.events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_tasks on public.tasks;
create policy own_tasks on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_labs on public.labs;
create policy own_labs on public.labs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles,public.events,public.tasks,public.labs to authenticated;
revoke all on public.profiles,public.events,public.tasks,public.labs from anon;

-- Run once in Supabase SQL Editor, or deploy through configured migrations.
create table if not exists public.class_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_code text not null,
  occurrence_key text not null,
  subject text not null,
  lesson_type text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  location text not null default '',
  required boolean not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, occurrence_key)
);
alter table public.class_preparations enable row level security;
drop policy if exists own_class_preparations on public.class_preparations;
create policy own_class_preparations on public.class_preparations for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.class_preparations to authenticated;
revoke all on public.class_preparations from anon;

-- Keep existing tasks; they remain under "Poza uczelnią" until reassigned.
alter table public.tasks add column if not exists category text not null default 'personal'
  check (category in ('personal', 'university'));
alter table public.class_preparations add column if not exists completed boolean not null default false;

alter table public.profiles add column if not exists hidden_classes jsonb not null default '[]'::jsonb;

-- Subskrypcje Web Push należą do konta i konkretnego urządzenia.
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
drop policy if exists own_push_subscriptions on public.push_subscriptions;
create policy own_push_subscriptions on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, reminder_key)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
