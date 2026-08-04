-- Supabase-specific companion to migration 0002 (product_state): auth FK +
-- RLS. Kept out of the portable Drizzle migration so PGlite tests can run
-- the DDL (same split as rls_policies_investments.sql).
alter table platform.product_state
  add constraint product_state_user_fk
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table platform.product_state enable row level security;

create policy product_state_owner on platform.product_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
