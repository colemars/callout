# Financial Platform Architecture Specification

Version: 0.1

## Vision

Build a reusable financial platform that powers multiple products.

The platform is the primary product.
Individual applications are clients of the platform.
The long-term asset is the financial engine, not any individual user interface.

Every architectural decision should optimize for:

* longevity
* maintainability
* testability
* portability
* product independence

## Mission

Create a modern financial platform capable of supporting multiple experiences from a single source of truth.

Examples include:

* Financial Accountability
* Financial Kingdom
* Mobile application
* AI Financial Coach
* Advisor Dashboard
* Retirement Planner
* Investment Planner
* Public API
* Third-party integrations

All products consume the same backend.
No product owns business logic.

## Core Philosophy

Business logic is the product.
Everything else is infrastructure.

Infrastructure may change.
Frameworks may change.
Hosting providers may change.
Frontend technologies may change.

The financial domain should remain stable.

## Architectural Principles

The project should follow:

* Platform-first architecture
* Clean Architecture
* Pragmatic Domain Driven Design
* SOLID principles
* Composition over inheritance
* Strong typing
* Explicitness over cleverness
* Infrastructure as Code
* Test-first mindset for business logic

## Product Boundary

### Platform

Responsible for:

* financial models
* calculations
* insight generation
* event generation
* persistence
* authentication
* APIs
* repositories
* infrastructure

### Products

Responsible for:

* presentation
* UX
* branding
* visualization
* language
* navigation

Products consume the platform.
The platform never depends on products.

## Technology Stack

### Language

TypeScript
Strict mode enabled.

### Frontend

Next.js
React
TypeScript
Tailwind

### Backend

Fastify
Node.js
Pino
Zod
OpenAPI

### Database

Supabase PostgreSQL

### ORM

Drizzle ORM

### Authentication

Supabase Auth
JWT verification inside API

### Infrastructure

AWS
Infrastructure defined using AWS CDK.

Primary services:

* ECS Fargate
* ECR
* CloudWatch
* Secrets Manager
* IAM
* Application Load Balancer

### CI/CD

GitHub Actions

### Testing

Vitest
Playwright
Fastify Inject

### Package Management

pnpm
Turborepo

## Repository Structure

```text
apps/
    api/
    worker/

    accountability-web/
    kingdom-web/

packages/
    financial-core/
    insight-engine/
    repositories/
    api-client/
    auth/
    database/
    shared/
    ui/

infra/
    cdk/

docker/

.github/
```

## Layered Architecture

```text
Products

↓

API

↓

Application Services

↓

Financial Core

↓

Repository Interfaces

↓

Infrastructure
```

Dependencies always point downward.
Never upward.

## Financial Core

The financial core contains canonical business models.

Examples:

* User
* Account
* Transaction
* Goal
* Snapshot
* Financial Event
* Metric
* Money
* Category
* Recurring Expense

No framework code.
No database code.
No AWS code.
No HTTP code.
No React code.

## Insight Engine

Consumes:

* financial state
* transactions
* goals
* recurring expenses

Produces:

* derived metrics
* normalized events
* projections
* health scores
* recommendations

The insight engine should be deterministic.
Every output should be explainable.
No AI should exist inside the core engine.

## Financial Events

The platform communicates through normalized events.

Examples:

* `GOAL_OFF_TRACK`
* `GOAL_ON_TRACK`
* `MONTHLY_SPENDING_INCREASED`
* `MONTHLY_SPENDING_DECREASED`
* `RECURRING_EXPENSE_ADDED`
* `RECURRING_EXPENSE_REMOVED`
* `HIGH_INTEREST_DEBT_INCREASED`
* `HIGH_INTEREST_DEBT_DECREASED`
* `NET_CASH_FLOW_NEGATIVE`
* `NET_CASH_FLOW_POSITIVE`
* `PASSIVE_INCOME_INCREASED`
* `EMERGENCY_RUNWAY_CHANGED`

Products translate these events into their own language.

## Product Translation

Example:

Platform

`GOAL_OFF_TRACK`

↓

Accountability App

"You are behind your emergency savings goal."

↓

Kingdom App

"The kingdom's grain stores are filling more slowly than expected."

The platform never knows kingdoms exist.

## Repository Pattern

Business logic depends on interfaces.

Example:

FinancialGoalRepository
↓
SupabaseFinancialGoalRepository

Infrastructure is replaceable.

## API Philosophy

REST
Versioned
`/api/v1`
Typed
Documented

Every endpoint validates:

* input
* output
* authentication

No frontend manually builds requests.
All products consume the shared SDK.

## Security

* JWT verification
* Authorization middleware
* Secrets Manager
* Environment validation
* Rate limiting
* Helmet
* CORS
* Structured logging

No service role keys exposed to clients.

## Infrastructure

AWS is responsible for compute.

Supabase is responsible for:

* PostgreSQL
* Authentication

AWS responsibilities:

* ECS
* ECR
* CloudWatch
* ALB
* IAM
* Secrets
* Networking

Everything provisioned through CDK.

## Logging

Every request should include:

* request id
* user id
* duration
* status
* route

Errors should be structured.

## Background Jobs

A worker application should exist from day one.
No implementation required initially.

The architecture should support:

* SQS
* scheduled jobs
* imports
* notifications
* recalculations

## Money Rules

Never use floating point numbers.
Persist monetary values using integer minor units.
Money calculations must be deterministic.

## Domain Rules

Business logic must never depend on:

* Fastify
* AWS
* Supabase
* React
* Next.js
* Node APIs

## Development Order

### Phase 1

Repository
Monorepo
Tooling
Docker
CI
Infrastructure skeleton

### Phase 2

AWS CDK
Networking
ECS
Logging
Secrets
Deployment pipeline

### Phase 3

Financial Core
Domain models
Money
Events
Repositories

### Phase 4

Insight Engine
Metrics
Calculations
Recommendations
Tests

### Phase 5

API
Authentication
OpenAPI
SDK

### Phase 6

Financial Accountability

### Phase 7

Financial Kingdom

### Phase 8

CSV Import
Provider abstraction

### Phase 9

Background workers
Queues
Notifications

### Phase 10

Production hardening
Observability
Performance
Scaling

## Coding Standards

* Strict TypeScript
* Small modules
* High cohesion
* Low coupling
* Explicit interfaces
* Prefer composition
* Favor readability
* No duplicated business logic
* Unit test all calculations
* Integration test repositories
* End-to-end test primary flows

## Decision Rule

Whenever implementing a feature, ask:

"Does this belong to the platform or to a product?"

If multiple products could use it,
it belongs in the platform.

If only one product needs it,
it belongs in that product.

## Expectations for AI Coding Assistants

When implementing code:

1. Preserve architectural boundaries.
2. Explain tradeoffs when better alternatives exist.
3. Prefer maintainability over speed.
4. Avoid unnecessary abstractions.
5. Keep business logic framework-independent.
6. Produce production-quality code.
7. Build incrementally in reviewable phases.
8. Never sacrifice long-term architecture for short-term convenience.

This document is the project's source of truth.
Future implementation should remain consistent with this architecture unless a clearly superior design is identified and the tradeoffs are documented.

---

## Amendments (v0.2 notes — 2026-08-03 review)

The v0.1 text above is preserved verbatim. The following review-driven deltas apply until folded into a future revision.

### 1. Reorder phases: domain-first, not infra-first

The v0.1 phase order spends Phases 1–2 on Docker, CDK, ECS, and deployment pipelines before any domain code exists, which contradicts the document's own core philosophy ("business logic is the product; everything else is infrastructure"). `financial-core` is pure TypeScript and needs zero infrastructure to build and test.

Revised order:

1. Monorepo + tooling + CI (lightweight; no Docker/CDK yet)
2. Financial Core (Money, domain models, events, repository interfaces)
3. Insight Engine (metrics, calculations, recommendations, tests)
4. Data ingestion (pulled forward — see amendment 3)
5. API + Authentication + OpenAPI + SDK
6. First product (Financial Accountability)
7. Infrastructure hardening (CDK/ECS when traffic justifies it — see amendment 2)
8. Financial Kingdom and further products
9. Background workers, queues, notifications
10. Production hardening, observability, performance, scaling

### 2. Defer ECS Fargate / ALB / CDK

ECS Fargate + ALB + ECR carries roughly $50–100+/month standing cost plus VPC/networking ops surface — unjustified before the platform has users. The repository pattern and framework-free core make hosting swappable by design, so exploit that: run the same Fastify app on a cheap target first (Lambda behind API Gateway, App Runner, or Fly.io) and adopt the full CDK/ECS stack when a product has real traffic.

### 3. Pull data ingestion forward

v0.1 places CSV import and provider abstraction at Phase 8, but neither product is demoable without transactions in the database. Ingestion belongs alongside or before the first product. The existing callout code in `supabase/functions/` (Plaid `/transactions/sync` with cursors, Vault-stored access tokens, category normalization in `category_map` + `mapCategory`) is the seed of the provider abstraction — port it into the platform rather than rewriting it.

### 4. Split-cloud tradeoff is deliberate, not incidental

Supabase (Postgres + Auth) plus AWS (compute) means two vendors, two secret stores, and cross-cloud latency on every query. This is accepted for Supabase Auth's developer experience and managed Postgres. Revisit if latency or operational overhead bites; the repository layer is the seam that makes consolidation possible later.

### 5. Known gaps to resolve in a future revision

* **Multi-tenancy / user isolation** — implied by Advisor Dashboard and Public API but unspecified. Needs a tenancy model before the API phase.
* **Migration path** — the currently deployed callout stack (Supabase project `hkxerogzvowkyvdifbpn`, edge functions, GitHub Pages dashboard at colemars.github.io/callout) keeps running as-is until platform ingestion + the first product replace it. Its schema and sync logic inform, but do not constrain, the platform's canonical models.
* **Worker from day one** — acceptable only as an empty placeholder app; no queue infrastructure until Phase 9-equivalent.

## Security, Privacy & Trust Architecture (v0.3 — 2026-08-05)

Trust is one of the products. Users hand this platform their complete
financial life; security and privacy are product features, not
implementation details. Every design decision optimizes for: least
privilege, defense in depth, data minimization, auditability, and a
straightforward path to future compliance.

The standing question when designing anything: **"what is the minimum
information this component actually needs?"** If it doesn't need balances,
it doesn't get balances. If a derived representation suffices, the raw
record never travels.

### Boundaries are packages, not services

A proposed five-service topology (Identity / Financial Platform / Analytics
Projection / Kingdom Projection / Clients) was evaluated and **rejected at
this scale**. The security property it buys — raw financial data existing in
as few places as possible — is already enforced here, in-process:

* **Identity** is Supabase Auth. `platform.*` stores no email, name, or PII
  — every table keys on the opaque auth UUID only. An engineer reading
  financial tables cannot tell whose records they are.
* **The Financial Platform** is the API + worker (one logical service).
  It is the only code that touches raw financial data or speaks to Plaid.
* **The boundary out** is the zod serializer allow-list
  (`apps/api/src/schemas.ts`): responses validate AND strip — `userId`,
  vault ids, external ids, connection internals never leave the API.
* **The package graph** is policed by dependency-cruiser: financial-core
  has zero runtime deps; the engine is pure; products consume served
  metrics/events through translation layers.

Network seams would add IAM surface, deploy complexity, latency, and cost
without changing the enforcement mechanism. Revisit if: real multi-tenant
scale, a second engineering team, or a compliance mandate that requires
physically separated processing.

### The user-honesty carve-out

Products render the authenticated user's **own** raw data by design — the
kingdom's Prime Rule (every number traces to a statement line) depends on
it. "Projections-only" applies to **non-user consumers**:

* **AI (the scribe)** receives exactly six fields per merchant group —
  cleaned description, merchant, amount, account kind, Plaid code,
  occurrence count. No ids, no balances, no institutions, no dates.
  This is the template for every future AI surface.
* **Notifications** consume derived events only.
* Any future analytics, support tooling, or third-party surface consumes
  Tier 4 (below), never Tier 3.

### Data classification

| Tier | What | Where | Who may touch it |
|---|---|---|---|
| T1 Identity | email, password hash, MFA | `auth.users` (Supabase Auth) | Auth service; JWT claims only elsewhere |
| T2 Financial metadata | institution names, connection status, product grants, categories, liability terms | `provider_connections` (minus secret ids), `account_liabilities`, `category_rules` | Platform API/worker; serialized subsets to the user |
| T3 Raw financial | transactions, accounts, balances, snapshots, investment activity, goals, **Plaid tokens (Supabase Vault)** | `platform.*`, `vault.secrets` | Platform API/worker only; Vault RPCs owner/service_role only |
| T4 Derived | metrics, events, insights, product_state, KingdomState | `metric_snapshots`, `events`, `product_state` | Any authenticated product surface (user-scoped) |

### Standing rules

1. New component checklist: does it need raw data (almost never)? does it
   need identity (UUID only)? can it run on projections (prefer)?
2. Plaid tokens live in Vault, are resolved by security-definer RPCs
   granted to owner/service_role only, and are **never logged**.
3. Secrets live in Secrets Manager (AWS) or Vault (Supabase); never in the
   repo, never echoed in tooling output.
4. Webhook endpoints verify signatures over the exact raw request bytes
   (see `apps/api/src/webhooks.ts` — alg-pinned JWT, freshness window,
   constant-time digest compare).
5. Every API route derives its user from the verified JWT; no route accepts
   a client-supplied user id.
6. Data rights are product features: `GET /api/v1/export` (full archive)
   and `DELETE /api/v1/data` (full wipe, confirmation-gated).
7. Access is attributable: the API logs the acting user id and route
   template on every response; authorization headers are redacted.

### Accepted risks & roadmap

* Deploy-time `{{resolve:secretsmanager}}` leaves secrets readable in
  Lambda env configuration — accepted for now; move to runtime SDK reads
  if the threat model tightens.
* The daily digest is single-recipient (operator) — must become per-user
  before a second tenant is real.
* Legacy `public.*` tables (deny-all RLS, service-role only) await a final
  drop once the parallel-run window closes.
* Per-user envelope encryption (unique DEK per user under KMS) and SOC 2
  Type I/II are compliance-phase work: the architecture (IaC, least
  privilege, audit logs, encryption at rest, secrets management) is built
  so they are additive, not rewrites.
