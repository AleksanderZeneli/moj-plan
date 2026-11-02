-- Keep existing tasks; they remain under "Poza uczelnią" until reassigned.
alter table public.tasks add column if not exists category text not null default 'personal'
  check (category in ('personal', 'university'));
alter table public.class_preparations add column if not exists completed boolean not null default false;
