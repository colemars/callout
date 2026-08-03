-- Vault helpers (service-role only) + app_config for internal tokens.
-- Token VALUES are inserted directly into app_config at setup time, never committed here.

create table app_config (
  key text primary key,
  value text not null
);
alter table app_config enable row level security;

create or replace function store_plaid_token(p_name text, p_token text)
returns uuid
language sql security definer set search_path = ''
as $$ select vault.create_secret(p_token, p_name) $$;

create or replace function get_plaid_token(p_secret_id uuid)
returns text
language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where id = p_secret_id $$;

revoke all on function store_plaid_token(text, text) from public, anon, authenticated;
revoke all on function get_plaid_token(uuid) from public, anon, authenticated;
grant execute on function store_plaid_token(text, text) to service_role;
grant execute on function get_plaid_token(uuid) to service_role;
