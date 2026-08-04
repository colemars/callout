-- Supabase-specific hardening for platform.investment_activity (applied live
-- alongside migration 0001; kept out of the portable Drizzle migration so
-- PGlite tests can run the DDL).

alter table platform.investment_activity
  add constraint investment_activity_user_fk foreign key (user_id) references auth.users(id) on delete cascade;

alter table platform.investment_activity enable row level security;

create policy investment_activity_owner on platform.investment_activity
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
