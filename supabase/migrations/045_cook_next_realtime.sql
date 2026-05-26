-- Enable realtime broadcasts on cook_next_list so connected clients can
-- subscribe and update their UI when another galley member adds, removes,
-- or clears entries. Without this, cook-next stays stale until the user
-- pull-to-refreshes (push notifications fire but don't auto-refetch).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cook_next_list'
  ) then
    alter publication supabase_realtime add table public.cook_next_list;
  end if;
end $$;
