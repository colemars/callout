import type { Brand } from "../brand.js";

/**
 * Calendar dates as validated ISO strings ("2026-08-03"). The domain never
 * holds Date objects: no timezones, no clocks, trivially deterministic.
 * Date.UTC is used internally as calendar arithmetic only.
 */
export type ISODate = Brand<string, "ISODate">;
export type ISOMonth = Brand<string, "ISOMonth">;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDate(s: string): ISODate {
  const match = DATE_RE.exec(s);
  if (!match) {
    throw new TypeError(`Not an ISO date (YYYY-MM-DD): "${s}"`);
  }
  const [, y, mo, d] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date: "${s}"`);
  }
  return s as ISODate;
}

export function isoMonth(s: string): ISOMonth {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
    throw new TypeError(`Not an ISO month (YYYY-MM): "${s}"`);
  }
  return s as ISOMonth;
}

const DAY_MS = 86_400_000;

function toUtcMs(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): ISODate {
  const dt = new Date(ms);
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as ISODate;
}

export function addDays(d: ISODate, days: number): ISODate {
  if (!Number.isSafeInteger(days)) {
    throw new TypeError(`addDays requires an integer, got: ${days}`);
  }
  return fromUtcMs(toUtcMs(d) + days * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** ISO strings compare correctly lexicographically. */
export function compareDates(a: ISODate, b: ISODate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function monthOf(d: ISODate): ISOMonth {
  return d.slice(0, 7) as ISOMonth;
}

export function startOfMonth(m: ISOMonth): ISODate {
  return `${m}-01` as ISODate;
}

export function daysInMonth(m: ISOMonth): number {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function endOfMonth(m: ISOMonth): ISODate {
  return `${m}-${String(daysInMonth(m)).padStart(2, "0")}` as ISODate;
}

/** 1-based day of month. */
export function dayOfMonth(d: ISODate): number {
  return Number(d.slice(8, 10));
}
