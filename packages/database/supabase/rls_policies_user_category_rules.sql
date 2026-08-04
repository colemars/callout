-- Supabase-specific companion to migration 0003 (user_category_rules +
-- transactions.category_source): auth FK + RLS. Kept out of the portable
-- Drizzle migration so PGlite tests can run the DDL.
alter table platform.user_category_rules
  add constraint user_category_rules_user_fk
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table platform.user_category_rules enable row level security;

create policy user_category_rules_owner on platform.user_category_rules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
