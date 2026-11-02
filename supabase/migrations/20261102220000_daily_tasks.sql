-- Daily tasks are completed per calendar day (Europe/Warsaw), not permanently.
-- Existing one-time tasks retain their previous completion status.
alter table public.tasks
  add column if not exists recurrence text not null default 'none';

alter table public.tasks
  add column if not exists last_completed_on date;

alter table public.tasks
  add constraint tasks_recurrence_valid check (recurrence in ('none', 'daily'));
