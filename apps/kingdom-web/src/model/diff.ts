import type {
  ChronicleEntry,
  KingdomState,
  MoatState,
  ResourceKey,
  StructureKey,
  ThreatKind,
} from "./types";

/**
 * The engine-agnostic change feed (see CONTRACT.md): two kingdom snapshots in,
 * an ordered list of game events out. Policy-free — consumers decide which
 * deltas are worth animating or announcing. Guarantees:
 * - computeKingdomDiff(s, s) === []
 * - deterministic ordering: age → threats ended → resources → structures →
 *   moat → threats started/worsened → new chronicle entries
 *   (resolutions land before new problems)
 */
export type KingdomDelta =
  | { type: "AGE_ADVANCED"; from: number; to: number; toName: string }
  | { type: "AGE_REGRESSED"; from: number; to: number; toName: string }
  | {
      type: "RESOURCE_LEVEL_CHANGED";
      key: ResourceKey;
      from: number;
      to: number;
      fromValue: number | null;
      toValue: number | null;
    }
  | {
      type: "RESOURCE_VALUE_CHANGED";
      key: ResourceKey;
      fromValue: number;
      toValue: number;
      pctChange: number | null;
    }
  | { type: "STRUCTURE_APPEARED"; key: StructureKey; name: string; level: number }
  | { type: "STRUCTURE_REMOVED"; key: StructureKey; name: string }
  | {
      type: "STRUCTURE_LEVEL_CHANGED";
      key: StructureKey;
      name: string;
      from: number;
      to: number;
    }
  | { type: "THREAT_STARTED"; kind: ThreatKind; severity: number; title: string }
  | { type: "THREAT_ENDED"; kind: ThreatKind; title: string }
  | { type: "THREAT_SEVERITY_CHANGED"; kind: ThreatKind; from: number; to: number }
  | {
      type: "MOAT_CHANGED";
      from: number;
      to: number;
      fromTier: MoatState["tier"];
      toTier: MoatState["tier"];
    }
  | { type: "CHRONICLE_NEW"; entry: ChronicleEntry };

export function computeKingdomDiff(prev: KingdomState, next: KingdomState): KingdomDelta[] {
  const deltas: KingdomDelta[] = [];

  // 1. Age transitions.
  if (next.age.current > prev.age.current) {
    deltas.push({
      type: "AGE_ADVANCED",
      from: prev.age.current,
      to: next.age.current,
      toName: next.age.name,
    });
  } else if (next.age.current < prev.age.current) {
    deltas.push({
      type: "AGE_REGRESSED",
      from: prev.age.current,
      to: next.age.current,
      toName: next.age.name,
    });
  }

  const prevThreats = new Map(prev.threats.map((t) => [t.kind, t]));
  const nextThreats = new Map(next.threats.map((t) => [t.kind, t]));

  // 2. Threats resolved (good news first).
  for (const [kind, t] of prevThreats) {
    if (t.active && nextThreats.get(kind)?.active !== true) {
      deltas.push({ type: "THREAT_ENDED", kind, title: t.title });
    }
  }

  // 3. Resources.
  const prevResources = new Map(prev.resources.map((r) => [r.key, r]));
  for (const r of next.resources) {
    const p = prevResources.get(r.key);
    if (p === undefined) continue;
    if (p.level !== r.level) {
      deltas.push({
        type: "RESOURCE_LEVEL_CHANGED",
        key: r.key,
        from: p.level,
        to: r.level,
        fromValue: p.value,
        toValue: r.value,
      });
    } else if (p.value !== null && r.value !== null && p.value !== r.value) {
      deltas.push({
        type: "RESOURCE_VALUE_CHANGED",
        key: r.key,
        fromValue: p.value,
        toValue: r.value,
        pctChange:
          p.value === 0 ? null : Math.round(((r.value - p.value) / Math.abs(p.value)) * 1000) / 10,
      });
    }
  }

  // 4. Structures.
  const prevStructures = new Map(prev.structures.filter((s) => s.exists).map((s) => [s.key, s]));
  const nextStructures = new Map(next.structures.filter((s) => s.exists).map((s) => [s.key, s]));
  for (const [key, s] of nextStructures) {
    const p = prevStructures.get(key);
    if (p === undefined) {
      deltas.push({ type: "STRUCTURE_APPEARED", key, name: s.name, level: s.level });
    } else if (p.level !== s.level) {
      deltas.push({
        type: "STRUCTURE_LEVEL_CHANGED",
        key,
        name: s.name,
        from: p.level,
        to: s.level,
      });
    }
  }
  for (const [key, s] of prevStructures) {
    if (!nextStructures.has(key)) {
      deltas.push({ type: "STRUCTURE_REMOVED", key, name: s.name });
    }
  }

  // 5. Moat.
  if (prev.moat.score !== next.moat.score) {
    deltas.push({
      type: "MOAT_CHANGED",
      from: prev.moat.score,
      to: next.moat.score,
      fromTier: prev.moat.tier,
      toTier: next.moat.tier,
    });
  }

  // 6. Threats started or worsened/eased.
  for (const [kind, t] of nextThreats) {
    const p = prevThreats.get(kind);
    if (t.active && p?.active !== true) {
      deltas.push({ type: "THREAT_STARTED", kind, severity: t.severity, title: t.title });
    } else if (t.active && p?.active === true && p.severity !== t.severity) {
      deltas.push({
        type: "THREAT_SEVERITY_CHANGED",
        kind,
        from: p.severity,
        to: t.severity,
      });
    }
  }

  // 7. New chronicle entries (by refId — stable, traceable identity).
  const seen = new Set(prev.chronicle.map((c) => c.refId));
  for (const entry of next.chronicle) {
    if (!seen.has(entry.refId)) {
      deltas.push({ type: "CHRONICLE_NEW", entry });
    }
  }

  return deltas;
}
