-- Authoritative grant posture for the platform schema (ARCHITECTURE.md
-- "Security, Privacy & Trust"). Re-apply after schema changes.
--
-- Clients reach platform data ONLY through the platform API (JWT-scoped,
-- allow-list serialized). PostgREST access to platform.* is service_role
-- only (the plaid-link edge function), which has its own grants and
-- bypasses RLS. The owner-only RLS policies in rls_policies*.sql remain as
-- defense-in-depth should a grant ever be reintroduced.

revoke all on all tables in schema platform from anon, authenticated;
revoke usage on schema platform from anon, authenticated;
alter default privileges in schema platform revoke all on tables from anon, authenticated;
