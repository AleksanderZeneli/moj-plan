-- Explicit, one-time account preference update. Never choose arbitrarily among users.
do $$
declare
  account_id uuid;
  account_count integer;
begin
  select count(*) into account_count from auth.users;
  if account_count <> 1 then
    raise exception 'Cannot identify the owner uniquely: % accounts. No preference changes applied.', account_count;
  end if;
  select id into account_id from auth.users;
  insert into public.profiles (user_id, hidden_classes)
    values (account_id, '[{"subject":"Bazy danych","type":"Ćwiczenia"},{"subject":"Język angielski","type":""}]'::jsonb)
  on conflict (user_id) do update set hidden_classes = (
    select jsonb_agg(distinct rule)
    from jsonb_array_elements(public.profiles.hidden_classes || excluded.hidden_classes) as items(rule)
  );
  raise notice 'Requested class filters applied to the only account. Public timetable unchanged.';
end $$;
