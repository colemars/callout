-- callout: core schema
-- Conventions: transactions.amount positive = money out (Plaid's sign convention).

create table plaid_items (
  id uuid primary key default gen_random_uuid(),
  plaid_item_id text unique not null,
  institution_name text not null,
  access_token_secret_id uuid not null,      -- Supabase Vault secret id; never the token itself
  sync_cursor text,
  status text not null default 'ok' check (status in ('ok','login_required','error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('plaid','apple_csv')),
  plaid_account_id text unique,              -- null for Apple Card
  item_id uuid references plaid_items(id),
  name text not null,
  institution text not null,
  type text not null,                        -- depository | credit | loan | investment
  subtype text,
  mask text,
  current_balance numeric,
  credit_limit numeric,
  balance_updated_at timestamptz,
  is_active boolean not null default true
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  source text not null check (source in ('plaid','apple_csv')),
  source_txn_id text not null,               -- plaid transaction_id or CSV row hash
  posted_at date not null,
  authorized_at date,
  posted_time timestamptz,                   -- when available; powers late-night detection
  name text not null,
  merchant text,
  amount numeric not null,                   -- positive = outflow
  pending boolean not null default false,
  source_category text,
  category text not null default 'other',
  unique (source, source_txn_id)
);
create index on transactions (posted_at desc);
create index on transactions (category, posted_at desc);

create table category_map (
  source text not null check (source in ('plaid','apple_csv')),
  source_category text not null,
  category text not null,
  primary key (source, source_category)
);

create table budgets (
  category text primary key,
  monthly_cap numeric not null,
  active boolean not null default true
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('savings_net_flow','balance_target','debt_paydown')),
  account_id uuid references accounts(id),   -- null for net-flow goals
  target_amount numeric not null,
  target_date date,
  note text,
  active boolean not null default true
);

create table recurring_merchants (
  id uuid primary key default gen_random_uuid(),
  merchant text unique not null,
  cadence text,
  avg_amount numeric,
  first_seen date,
  last_seen date,
  status text not null default 'active' check (status in ('active','maybe_dead','acknowledged'))
);

create table balance_snapshots (
  account_id uuid not null references accounts(id),
  as_of date not null,
  current_balance numeric not null,
  primary key (account_id, as_of)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  cadence text not null check (cadence in ('daily','weekly','monthly')),
  period_start date,
  period_end date,
  subject text not null,
  body_md text not null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table callouts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  fingerprint text not null,                 -- e.g. 'overspend:dining:2026-08', 'sub:hulu'
  kind text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on callouts (fingerprint, created_at);

create table routine_prompts (
  cadence text primary key check (cadence in ('voice','daily','weekly','monthly')),
  prompt_md text not null,
  updated_at timestamptz not null default now()
);

-- Deny-all RLS: only the service role (edge functions, MCP) touches data.
do $$
declare t text;
begin
  foreach t in array array['plaid_items','accounts','transactions','category_map','budgets',
    'goals','recurring_merchants','balance_snapshots','reports','callouts','routine_prompts']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
