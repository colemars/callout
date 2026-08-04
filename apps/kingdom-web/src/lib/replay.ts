import { fmtMinor } from "../model/derive";
import type { KingdomDelta } from "../model/diff";

/** Kingdom-voiced copy for the "since your last visit" strip — product voice
 * over the neutral delta contract. Returns null for deltas this surface skips. */
export function narrateDelta(
  d: KingdomDelta,
): { text: string; tone: "good" | "bad" | "info" } | null {
  switch (d.type) {
    case "AGE_ADVANCED":
      return { tone: "good", text: `🎺 The realm enters a new age: ${d.toName}!` };
    case "AGE_REGRESSED":
      return { tone: "bad", text: `The realm slips back to ${d.toName}. Steady the course.` };
    case "RESOURCE_LEVEL_CHANGED":
      return d.to > d.from
        ? { tone: "good", text: `${resourceName(d.key)} rises to level ${d.to}.` }
        : { tone: "bad", text: `${resourceName(d.key)} falls to level ${d.to}.` };
    case "RESOURCE_VALUE_CHANGED": {
      // Strip policy: only narrate meaningful moves (engines can tween every cent).
      if (d.pctChange === null || Math.abs(d.pctChange) < 1) return null;
      const grew = d.toValue > d.fromValue;
      return {
        tone: grew ? "good" : "info",
        text: `${resourceName(d.key)} ${grew ? "grew" : "eased"} ${describeValue(d.key, d.fromValue)} → ${describeValue(d.key, d.toValue)}.`,
      };
    }
    case "STRUCTURE_APPEARED":
      return { tone: "good", text: `🏗️ ${d.name} rises in the kingdom.` };
    case "STRUCTURE_REMOVED":
      return { tone: "good", text: `${d.name} is no more.` };
    case "STRUCTURE_LEVEL_CHANGED":
      return d.to > d.from
        ? { tone: "good", text: `${d.name} grows to level ${d.to}.` }
        : { tone: "info", text: `${d.name} diminishes to level ${d.to}.` };
    case "THREAT_ENDED":
      return { tone: "good", text: `⚔️ ${d.title} — the threat has passed.` };
    case "THREAT_STARTED":
      return { tone: "bad", text: `${d.title}.` };
    case "THREAT_SEVERITY_CHANGED":
      return d.to > d.from
        ? { tone: "bad", text: `A threat worsens (severity ${d.from} → ${d.to}).` }
        : { tone: "good", text: `A threat eases (severity ${d.from} → ${d.to}).` };
    case "MOAT_CHANGED":
      return d.to > d.from
        ? { tone: "good", text: `The moat widens: ${d.from} → ${d.to}.` }
        : { tone: "info", text: `The moat narrows: ${d.from} → ${d.to}.` };
    case "CHRONICLE_NEW":
      return { tone: d.entry.tone, text: `${d.entry.icon} ${d.entry.headline}` };
  }
}

function resourceName(key: string): string {
  return (
    {
      gold: "🪙 Gold",
      grain: "🌾 The grain stores",
      stone: "🪨 Stone",
      builders: "🔨 The workforce",
      happiness: "🎉 Happiness",
    }[key] ?? key
  );
}

function describeValue(key: string, value: number): string {
  if (key === "grain") return `${value} moons`;
  if (key === "happiness") return `${Math.round(value * 100)}%`;
  return fmtMinor(value);
}
