# Platform Roadmap

Implementation roadmap for [ARCHITECTURE.md](ARCHITECTURE.md), following the amended (v0.2) phase order: domain-first, infrastructure when traffic justifies it. Each phase is a reviewable, mergeable unit with something demonstrable at the end.

**Hard constraint:** the deployed callout stack (Supabase project `hkxerogzvowkyvdifbpn` edge functions + pg_cron + GitHub Pages dashboard) keeps working untouched until the Phase 6 cutover checklist completes.

## Phases

- [x] **Phase 1 — Monorepo + tooling + CI** (S) — *done 2026-08-03*
  pnpm workspace + Turborepo + Biome + dependency-cruiser + strict `tsconfig.base.json` + CI workflow + seed `packages/shared`. Coexists with `supabase/` and `web/` (both excluded from workspace/lint; Pages workflow untouched).
- [x] **Phase 2 — `packages/financial-core`** (M) — *done 2026-08-03*
  Zero-runtime-dependency domain package: Money (integer minor units, signed, half-even rounding, exact allocation), LocalDate helpers, branded-ID entities, `FinancialEvent` discriminated union with explainable payloads, repository ports. Purity enforced by package.json guard + `"types": []` + dependency-cruiser.
- [x] **Phase 3 — `packages/insight-engine`** (M) — *done 2026-08-03*
  Pure `computeMetrics(state, config, asOf)` / `deriveEvents(prev, curr)` / `project(...)`. Ports the proven SQL-view logic (`v_budget_status` pace math, `v_recurring_candidates` detection, `v_debt_trajectory` deltas) plus net cash flow and emergency runway. Golden fixture tests + fast-check property tests (purity, permutation-invariance, `deriveEvents(m, m) === []`).
- [x] **Phase 4 — Database + repositories + ingestion** (L, 2 PRs) — *done 2026-08-03*
  4a: `packages/database` (Drizzle-owned `platform.*` schema in the same Supabase project — accounts, transactions, provider_connections, goals, balance_snapshots, category_rules, metric_snapshots, events; `user_id` + RLS from day one) + `packages/repositories` (port implementations, integration-tested).
  4b: `packages/ingestion` (`TransactionProvider` interface, `runSync` orchestrator ported from `supabase/functions/plaid-sync`, Plaid + Apple-CSV providers, `Categorizer` ported verbatim) + `apps/worker` CLI (`sync` / `import-csv` / `backfill` with reconciliation) run by GitHub Actions cron. Old pg_cron sync keeps running in parallel.
- [x] **Phase 5 — API + Auth + SDK** (L) — *done 2026-08-03*
  `apps/api`: Fastify 5 + `fastify-type-provider-zod` → OpenAPI 3.1, `buildApp()` factory, Pino, helmet/cors/rate-limit. `packages/auth`: `jose` JWKS verification against Supabase Auth (prereq: migrate project to asymmetric signing keys). `packages/api-client`: `openapi-typescript` + `openapi-fetch` generated from the emitted spec.
- [ ] **Phase 6 — Financial Accountability + callout cutover** (L)
  `apps/accountability-web`: Next.js + Tailwind + `@supabase/ssr` (auth only; data via api-client), event-translation layer. Cutover: parallel-run ~2 weeks → `cron.unschedule('plaid-sync-daily')` → `web/` becomes a redirect → edge functions frozen, dropped months later.
- [ ] **Phase 7 — Infra: cheap-first AWS via CDK** (M)
  `infra/cdk`: Lambda (Node, arm64) + API Gateway HTTP API + Secrets Manager + OIDC deploy workflow. ~$0/month at current traffic. ECS later = Dockerfile targeting the existing `server.ts`; no app changes.
- [ ] **Phase 8 — Financial Kingdom** (M–L)
  `apps/kingdom-web` + extract `packages/ui` (only now — a second consumer exists). Same api-client, same events, different translation table.
- [ ] **Phase 9 — Workers, queues, notifications** (M)
  EventBridge Scheduler → sync → engine → `platform.events` → SQS → notifier (replaces the old `notify` edge function for good).
- [ ] **Phase 10 — Production hardening** (ongoing)
  Playwright e2e, CloudWatch alarms, Plaid webhooks (`SYNC_UPDATES_AVAILABLE` replaces polling), pooling review (`max: 1` per Lambda), Renovate.

## Standing decisions

- **Lazy package creation** — the spec's package tree is the end state; each phase creates only what it needs.
- **Biome** for lint/format (root-level); **dependency-cruiser** owns architecture boundaries; `tsc --noEmit` for type rigor.
- **Same Supabase project, new `platform` Postgres schema**, Drizzle-owned migrations. Legacy `public.*` and `supabase/migrations/` are never modified.
- **Multi-tenant from day one**: `user_id uuid references auth.users(id)` on every table, user-leading indexes, RLS policies written with the first migration.
- **Money**: integer minor units as `number` (`Number.isSafeInteger` asserted), **signed, negative = outflow** — the flip of Plaid's/callout's convention; normalized only in provider adapters.
- **Hosting**: platform API on Lambda until traffic justifies ECS; product frontends on Vercel Hobby (products aren't platform compute).
- **Plaid cursors are per-consumer**: the platform starts with a `null` cursor (full-history replay = free backfill); never copy `public.plaid_items.sync_cursor`. Vault access tokens are shared safely via the existing `get_plaid_token` RPC.

## Key risks and their mitigations

| Risk | Mitigation |
|---|---|
| Breaking the live callout stack mid-migration | Platform writes only to `platform.*`; `supabase/`, pg_cron, `pages.yml` untouched until the Phase 6 checklist |
| Sign-convention flip corrupting amounts | Normalize in provider adapters only; golden test with a real Plaid payload fixture; backfill prints old-vs-new signed sums |
| `numeric` dollars → minor-units rounding drift | String-based conversion, never floats; row-count + per-account sum reconciliation before trusting `platform.*` |
| Stale Plaid cursor reuse | `provider_connections.cursor` starts `null`; cursors never copied |
| Supabase legacy HS256 secret in AWS | Migrate to asymmetric signing keys before Phase 5; verify via JWKS (`jose`) |
| Engine output diverging from trusted SQL views | Phase 3 ports view logic with views as reference; Phase 4 real-data golden compares engine output to the live dashboard before cutover |
| Solo-dev scaffolding drown | Lazy package creation; Docker deferred to the ECS migration; each phase one PR with a demo |
