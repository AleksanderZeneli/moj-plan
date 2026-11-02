alter table public.profiles add column if not exists hidden_classes jsonb not null default '[]'::jsonb;
