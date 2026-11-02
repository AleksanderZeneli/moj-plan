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
