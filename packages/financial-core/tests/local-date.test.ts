import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  dayOfMonth,
  daysBetween,
  daysInMonth,
  endOfMonth,
  isoDate,
  isoMonth,
  monthOf,
  startOfMonth,
} from "../src/dates/local-date.js";

describe("isoDate", () => {
  it("accepts real dates", () => {
    expect(isoDate("2026-08-03")).toBe("2026-08-03");
    expect(isoDate("2024-02-29")).toBe("2024-02-29"); // leap year
  });

  it("rejects bad formats and impossible dates", () => {
    expect(() => isoDate("2026-8-3")).toThrow(TypeError);
    expect(() => isoDate("08/03/2026")).toThrow(TypeError);
    expect(() => isoDate("2026-02-30")).toThrow(RangeError);
    expect(() => isoDate("2026-13-01")).toThrow(RangeError);
    expect(() => isoDate("2025-02-29")).toThrow(RangeError); // not a leap year
  });
});

describe("arithmetic", () => {
  it("addDays crosses month and leap boundaries", () => {
    expect(addDays(isoDate("2026-01-31"), 1)).toBe("2026-02-01");
    expect(addDays(isoDate("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(isoDate("2025-02-28"), 1)).toBe("2025-03-01");
    expect(addDays(isoDate("2026-01-01"), -1)).toBe("2025-12-31");
    expect(addDays(isoDate("2026-08-03"), 365)).toBe("2027-08-03");
  });

  it("daysBetween is signed", () => {
    expect(daysBetween(isoDate("2026-08-01"), isoDate("2026-08-31"))).toBe(30);
    expect(daysBetween(isoDate("2026-08-31"), isoDate("2026-08-01"))).toBe(-30);
    expect(daysBetween(isoDate("2026-08-03"), isoDate("2026-08-03"))).toBe(0);
  });

  it("compareDates orders lexicographically-correct ISO strings", () => {
    expect(compareDates(isoDate("2026-01-02"), isoDate("2026-01-10"))).toBe(-1);
    expect(compareDates(isoDate("2026-01-10"), isoDate("2026-01-02"))).toBe(1);
    expect(compareDates(isoDate("2026-01-02"), isoDate("2026-01-02"))).toBe(0);
  });
});

describe("months", () => {
  it("monthOf / startOfMonth / endOfMonth / daysInMonth", () => {
    const d = isoDate("2026-02-15");
    expect(monthOf(d)).toBe("2026-02");
    expect(startOfMonth(monthOf(d))).toBe("2026-02-01");
    expect(endOfMonth(monthOf(d))).toBe("2026-02-28");
    expect(daysInMonth(isoMonth("2024-02"))).toBe(29);
    expect(daysInMonth(isoMonth("2026-08"))).toBe(31);
    expect(dayOfMonth(d)).toBe(15);
  });

  it("isoMonth validates", () => {
    expect(() => isoMonth("2026-13")).toThrow(TypeError);
    expect(() => isoMonth("2026-8")).toThrow(TypeError);
  });
});
