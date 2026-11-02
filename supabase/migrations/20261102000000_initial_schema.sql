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

