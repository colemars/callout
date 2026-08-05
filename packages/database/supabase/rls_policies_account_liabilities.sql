-- Supabase-specific companion to migration 0004 (account_liabilities): auth FK
-- + RLS. Kept out of the portable Drizzle migration so PGlite tests can run
-- the DDL.
alter table platform.account_liabilities
  add constraint account_liabilities_user_fk
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table platform.account_liabilities enable row level security;

create policy account_liabilities_owner on platform.account_liabilities
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
