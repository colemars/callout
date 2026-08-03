import { type CurrencyCode, MINOR_UNIT_EXPONENT } from "../currency.js";

/**
 * Money as integer minor units (cents for USD).
 *
 * Platform sign convention: NEGATIVE = outflow (money leaving the user),
 * POSITIVE = inflow. This is the opposite of Plaid's convention; provider
 * adapters normalize at the ingestion boundary and nowhere else.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode = "USD"): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError(`Money amount must be a safe integer of minor units, got: ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function zero(currency: CurrencyCode = "USD"): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

export function abs(m: Money): Money {
  return money(Math.abs(m.amountMinor), m.currency);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

export function isPositive(m: Money): boolean {
  return m.amountMinor > 0;
}

/** Sums an array; the explicit currency makes the empty-array case well-defined. */
export function sumOf(ms: readonly Money[], currency: CurrencyCode): Money {
  return ms.reduce((acc, m) => add(acc, m), zero(currency));
}

export type RoundingMode = "half-even" | "half-up" | "floor" | "ceil";

/**
 * Rounds the rational p/q (q > 0) to an integer.
 * - half-even: banker's rounding (ties to the even neighbor) — the default everywhere.
 * - half-up: ties away from zero.
 * - floor/ceil: toward -Infinity / +Infinity.
 */
function divideRounded(p: number, q: number, mode: RoundingMode): number {
  const f = Math.floor(p / q);
  const r = p - f * q; // 0 <= r < q
  if (r === 0) return f;
  const twiceR = 2 * r;
  switch (mode) {
    case "floor":
      return f;
    case "ceil":
      return f + 1;
    case "half-up":
      if (twiceR > q) return f + 1;
      if (twiceR < q) return f;
      return p >= 0 ? f + 1 : f; // tie: away from zero
    case "half-even":
      if (twiceR > q) return f + 1;
      if (twiceR < q) return f;
      return f % 2 === 0 ? f : f + 1; // tie: even neighbor
  }
}

/** m * numerator / denominator with integer-exact rounding. */
export function multiplyRatio(
  m: Money,
  numerator: number,
  denominator: number,
  mode: RoundingMode = "half-even",
): Money {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new TypeError("multiplyRatio requires integer numerator and denominator");
  }
  if (denominator === 0) {
    throw new RangeError("multiplyRatio: denominator must not be zero");
  }
  let p = m.amountMinor * numerator;
  let q = denominator;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  if (!Number.isSafeInteger(p)) {
    throw new RangeError("multiplyRatio: intermediate product exceeds safe integer range");
  }
  return money(divideRounded(p, q, mode), m.currency);
}

/**
 * Splits m across weights using the largest-remainder method.
 * The parts always sum exactly to m. Ties go to the earliest index.
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new RangeError("allocate: weights must not be empty");
  }
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new RangeError(`allocate: weights must be finite and non-negative, got: ${w}`);
    }
  }
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  if (totalWeight <= 0) {
    throw new RangeError("allocate: weights must sum to a positive number");
  }

  const negative = m.amountMinor < 0;
  const total = Math.abs(m.amountMinor);

  const raw = weights.map((w) => (total * w) / totalWeight);
  const base = raw.map((r) => Math.floor(r));
  let leftover = total - base.reduce((a, b) => a + b, 0);

  const byRemainder = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byRemainder) {
    if (leftover === 0) break;
    base[i] = (base[i] ?? 0) + 1;
    leftover -= 1;
  }

  return base.map((units) => money(negative ? -units : units, m.currency));
}

/**
 * Parses a decimal string ("12.34", "-0.05", "12") into Money.
 * Strings only — floats never touch monetary values. Throws if the string
 * carries more precision than the currency supports.
 */
export function minorFromDecimalString(s: string, currency: CurrencyCode = "USD"): Money {
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!match) {
    throw new TypeError(`Not a decimal amount: "${s}"`);
  }
  const exponent = MINOR_UNIT_EXPONENT[currency];
  const sign = match[1] === "-" ? -1 : 1;
  const wholePart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  if (fracPart.length > exponent) {
    throw new RangeError(
      `"${s}" has more precision than ${currency} supports (${exponent} digits)`,
    );
  }
  const minor = Number(wholePart) * 10 ** exponent + Number(fracPart.padEnd(exponent, "0") || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`"${s}" exceeds the safe integer range in minor units`);
  }
  return money(sign * minor, currency);
}

/** Formats Money as a plain decimal string ("-12.34"). Presentation formatting belongs to products. */
export function toDecimalString(m: Money): string {
  const exponent = MINOR_UNIT_EXPONENT[m.currency];
  const sign = m.amountMinor < 0 ? "-" : "";
  const total = Math.abs(m.amountMinor);
  const whole = Math.floor(total / 10 ** exponent);
  const frac = String(total % 10 ** exponent).padStart(exponent, "0");
  return `${sign}${whole}.${frac}`;
}
