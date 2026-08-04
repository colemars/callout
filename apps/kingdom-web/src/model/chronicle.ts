import type { ApiEvent, TranslatedEvent } from "@platform/ui";
import { classifyAccount, fmtMinor } from "./derive";
import type { ChronicleEntry, KingdomAccount, KingdomInput, KingdomTxn } from "./types";

/**
 * The chronicle: "what happened in my kingdom while I was away?"
 * Platform events (ravens) merged with notable ledger lines, kingdom-voiced.
 * Every entry keeps a refId back to the raw line — nothing is invented.
 */
export function buildChronicle(
  input: KingdomInput,
  translateEvent: (e: ApiEvent) => TranslatedEvent,
  cap = 12,
): ChronicleEntry[] {
  const eventEntries: ChronicleEntry[] = input.events.map((e) => {
    const t = translateEvent(e);
    const icon = e.type.includes("DEBT")
      ? "🏴"
      : e.type.includes("GOAL") || e.type.includes("RUNWAY")
        ? "🌾"
        : e.type.includes("SPENDING") || e.type.includes("RECURRING")
          ? "🎪"
          : "🐦";
    return {
      date: e.occurredOn,
      icon,
      headline: t.headline,
      tone: t.tone,
      source: "event",
      refId: `${e.type}:${e.occurredOn}`,
    };
  });

  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const recurringMerchants = new Set(
    (input.metrics?.recurringCandidates ?? []).map((r) => r.merchant.toLowerCase()),
  );

  const activityEntries: ChronicleEntry[] = input.investmentActivity.flatMap((a) => {
    const size = Math.abs(a.amount.amountMinor);
    if (a.kind === "contribution" && a.amount.amountMinor > 0) {
      return [
        {
          date: a.date,
          icon: "🐪",
          headline: `A caravan departs for the Treasury — ${fmtMinor(size)} invested.`,
          tone: "good" as const,
          source: "txn" as const,
          refId: a.id,
        },
      ];
    }
    if ((a.kind === "dividend" || a.kind === "interest") && a.amount.amountMinor > 0) {
      return [
        {
          date: a.date,
          icon: "🏞️",
          headline: `The estates pay their yield — +${fmtMinor(size)}${a.ticker ? ` (${a.ticker})` : ""}.`,
          tone: "good" as const,
          source: "txn" as const,
          refId: a.id,
        },
      ];
    }
    return [];
  });

  const txnEntries: ChronicleEntry[] = input.transactions
    .filter((t) => !t.pending)
    .flatMap((t) => {
      const entry = translateTxn(t, accountById, recurringMerchants);
      return entry === null
        ? []
        : [{ ...entry, date: t.postedAt, source: "txn" as const, refId: t.id }];
    });

  return [...eventEntries, ...activityEntries, ...txnEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, cap);
}

type Partial = Omit<ChronicleEntry, "date" | "source" | "refId"> | null;

function translateTxn(
  t: KingdomTxn,
  accountById: Map<string, KingdomAccount>,
  recurringMerchants: Set<string>,
): Partial {
  const amount = t.amount.amountMinor;
  const size = Math.abs(amount);
  const label = t.merchant ?? t.description;
  const account = t.accountId === undefined ? undefined : accountById.get(t.accountId);
  const accountClass = account === undefined ? null : classifyAccount(account);
  const desc = t.description.toLowerCase();

  // 1. Income: tribute, interest, paychecks.
  if (t.category === "income" && amount > 0) {
    if (size >= 500_00) {
      return {
        icon: "🪙",
        headline: `The tax collectors return — ${fmtMinor(size)} gathered from ${label}.`,
        tone: "good",
      };
    }
    if (/intrst|interest/.test(desc)) {
      return {
        icon: "🏦",
        headline: `The royal vault yields interest — +${fmtMinor(size)}.`,
        tone: "good",
      };
    }
    return {
      icon: "🪙",
      headline: `Tribute arrives — ${fmtMinor(size)} from ${label}.`,
      tone: "good",
    };
  }

  if (amount >= 0) return null;

  // 2. Bandit toll: real interest/fee lines on debt accounts.
  if (
    (accountClass === "credit" || accountClass === "student" || accountClass === "mortgage") &&
    /interest|intrst|finance charge|late fee/.test(desc)
  ) {
    return {
      icon: "🏴",
      headline: `The bandits take their toll — ${fmtMinor(size)} to ${account?.name ?? label}.`,
      tone: "bad",
    };
  }

  // 3. Tithes: recurring merchants and subscriptions.
  if (recurringMerchants.has((t.merchant ?? "").toLowerCase()) || t.category === "subscriptions") {
    return { icon: "📜", headline: `Tithe paid to ${label} — ${fmtMinor(size)}.`, tone: "info" };
  }

  // 4. Caravans: money moved into investment vaults.
  if (
    t.category === "transfer" &&
    (accountClass === "retirement" || accountClass === "brokerage")
  ) {
    return {
      icon: "🐪",
      headline: `A caravan departs for the Treasury — ${fmtMinor(size)} invested.`,
      tone: "good",
    };
  }

  // 5. Debt repayment.
  if (t.category === "debt_payment" && size >= 25_00) {
    return {
      icon: "⚔️",
      headline: `The crown pays the moneylenders — ${fmtMinor(size)} toward ${label}.`,
      tone: "good",
    };
  }

  // 6. Journeys (cheerful — never scold the court for living).
  if (t.category === "travel" && size >= 100_00) {
    return {
      icon: "🗺️",
      headline: `The court journeys afar — ${fmtMinor(size)} (${label}).`,
      tone: "info",
    };
  }

  // 7. Toll keepers: fees anywhere else.
  if (/\bfee\b|charge/.test(desc) && size >= 5_00) {
    return {
      icon: "🛃",
      headline: `The toll keeper collects — ${fmtMinor(size)} (${label}).`,
      tone: "bad",
    };
  }

  // 8. Notable market days.
  if (size >= 150_00) {
    return { icon: "🛒", headline: `${label} — ${fmtMinor(size)} at the market.`, tone: "info" };
  }

  // Small spends: the market hums; no chronicle line.
  return null;
}
