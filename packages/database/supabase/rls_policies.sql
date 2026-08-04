-- Supabase-specific hardening for the platform schema. Applied separately from
-- the Drizzle migrations (which stay portable / PGlite-testable): FKs to
-- auth.users and deny-by-default RLS with owner-only policies.
--
-- The API/worker connect as the postgres role (table owner), which RLS does not
-- constrain — these policies are defense-in-depth for any future exposure of
-- the platform schema through PostgREST or client libraries.

alter table platform.provider_connections
  add constraint provider_connections_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.accounts
  add constraint accounts_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.transactions
  add constraint transactions_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.goals
  add constraint goals_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.budgets
  add constraint budgets_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.balance_snapshots
  add constraint balance_snapshots_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.metric_snapshots
  add constraint metric_snapshots_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table platform.events
  add constraint events_user_fk foreign key (user_id) references auth.users(id) on delete cascade;

do $$
declare t text;
begin
  foreach t in array array['provider_connections','accounts','transactions','goals','budgets',
    'balance_snapshots','category_rules','metric_snapshots','events']
  loop
    execute format('alter table platform.%I enable row level security', t);
  end loop;
end $$;

-- Owner-only access for authenticated users on user-scoped tables.
do $$
declare t text;
begin
  foreach t in array array['provider_connections','accounts','transactions','goals','budgets',
    'balance_snapshots','metric_snapshots','events']
  loop
    execute format(
      'create policy %I on platform.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;

-- category_rules is global reference data: readable, never writable by clients.
create policy category_rules_read on platform.category_rules for select to authenticated using (true);
