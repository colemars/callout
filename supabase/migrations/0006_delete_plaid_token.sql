-- Vault token deletion for the data-rights wipe (DELETE /api/v1/data):
-- deleting a provider connection must not orphan its access token in the
-- vault. Same privilege posture as store/get — owner + service_role only.

create or replace function delete_plaid_token(p_secret_id uuid)
returns void
language sql security definer set search_path = ''
as $$ delete from vault.secrets where id = p_secret_id $$;

revoke all on function delete_plaid_token(uuid) from public, anon, authenticated;
grant execute on function delete_plaid_token(uuid) to service_role;
