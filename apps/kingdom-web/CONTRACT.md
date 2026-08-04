# Kingdom JSON Contract (engine-agnostic)

The rendering layer — today's text UI, tomorrow's Phaser/Godot/whatever — is a
pure consumer of two JSON shapes produced by `src/model/`:

1. **`KingdomState`** — the complete world snapshot (`kingdomModel(input)`).
2. **`KingdomDelta[]`** — the ordered change feed between two snapshots
   (`computeKingdomDiff(prev, next)`).

Both are plain serializable JSON (no classes, no Dates, no functions). Types
are the source of truth in `src/model/types.ts` and `src/model/diff.ts`.

## Versioning

`KingdomState.schemaVersion` (currently `1`) bumps on any breaking shape
change. Consumers must discard persisted snapshots whose version they don't
understand (see `src/lib/lastSeen.ts` for the reference implementation).

## Semantics engines can rely on

- **No fake currency**: every number traces to a real statement line or served
  metric; each resource/threat carries a human-auditable `basis` string.
  `provisional: true` marks judgments made from an incomplete month.
- **Numeric values with units**: resources carry `value`/`max`/`unit`
  (`minor` = integer USD cents, `months`, `ratio` 0–1, `count`, `score` 0–100);
  structures carry `value`/`unit`. Tween on `value`; `level` (0–5) is the
  coarse display tier. `displayValue` is pre-formatted text — never parse it.
- **Stable identity**: `ResourceKey`, `StructureKey`, `ThreatKind` are closed
  string unions; chronicle entries carry `refId` (transaction id or
  event-type:date) — safe keys for sprite lifecycles and dedup.
- **Silence over false comfort**: threats with `active: false` and
  `dormantReason: "no-data"` mean "cannot judge yet" — render nothing, not an
  all-clear.

## Delta ordering guarantee

`computeKingdomDiff` emits in this order (resolutions before new problems):
age transitions → threats ended → resource changes → structure changes → moat
→ threats started/severity-changed → new chronicle entries.
Invariant: `computeKingdomDiff(s, s) === []`.

The feed is **policy-free**: `RESOURCE_VALUE_CHANGED` fires on any value
change with `pctChange` attached; each consumer applies its own thresholds
(the text strip skips <1% moves; a canvas may tween every cent).

## Getting data

- **In-page engine (recommended: Phaser/TS)**: import `kingdomModel` +
  `computeKingdomDiff` directly — same product, same runtime, zero drift.
- **Time travel**: `GET /api/v1/insights/history?from&to` (daily MetricSets,
  ≤180-day window) and `GET /api/v1/events?since=<ISO timestamp>` (cursor on
  `createdAt` — `occurredOn` is the described date, not insertion time).
- **"While you were away"**: the reference baseline is per-device
  (localStorage `kingdom_last_seen_state` = what this device last rendered).
  Multi-device replay wants a server-side `last_seen_at` — future platform
  slice.
- **External engine (Godot etc.)**: consuming `/api/v1` raw means
  reimplementing the model (drift risk), and serving computed `KingdomState`
  from the platform would move product logic server-side — an explicit
  architecture tradeoff to accept before going that route.
