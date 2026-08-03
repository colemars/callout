import { describe, expect, it } from "vitest";
import {
  abs,
  add,
  allocate,
  compare,
  equals,
  isNegative,
  isPositive,
  isZero,
  minorFromDecimalString,
  money,
  multiplyRatio,
  negate,
  subtract,
  sumOf,
  toDecimalString,
  zero,
} from "../src/money/money.js";

describe("money()", () => {
  it("accepts integers", () => {
    expect(money(1234).amountMinor).toBe(1234);
    expect(money(-5, "USD").currency).toBe("USD");
    expect(money(0).amountMinor).toBe(0);
  });

  it.each([1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-safe-integer %s",
    (bad) => {
      expect(() => money(bad)).toThrow(TypeError);
    },
  );
});

describe("arithmetic", () => {
  it("adds and subtracts", () => {
    expect(add(money(100), money(250)).amountMinor).toBe(350);
    expect(subtract(money(100), money(250)).amountMinor).toBe(-150);
  });

  it("rejects mixed currencies everywhere", () => {
    expect(() => add(money(1, "USD"), money(1, "EUR"))).toThrow(/mismatch/i);
    expect(() => subtract(money(1, "USD"), money(1, "EUR"))).toThrow(/mismatch/i);
    expect(() => compare(money(1, "USD"), money(1, "EUR"))).toThrow(/mismatch/i);
    expect(() => sumOf([money(1, "USD"), money(1, "EUR")], "USD")).toThrow(/mismatch/i);
  });

  it("negate / abs / predicates", () => {
    expect(negate(money(5)).amountMinor).toBe(-5);
    expect(abs(money(-5)).amountMinor).toBe(5);
    expect(isZero(zero())).toBe(true);
    expect(isNegative(money(-1))).toBe(true);
    expect(isPositive(money(1))).toBe(true);
  });

  it("compare and equals", () => {
    expect(compare(money(1), money(2))).toBe(-1);
    expect(compare(money(2), money(1))).toBe(1);
    expect(compare(money(2), money(2))).toBe(0);
    expect(equals(money(2), money(2))).toBe(true);
    expect(equals(money(2, "USD"), money(2, "EUR"))).toBe(false);
  });

  it("sumOf handles the empty array via explicit currency", () => {
    expect(sumOf([], "USD")).toEqual(money(0, "USD"));
    expect(sumOf([money(1), money(2), money(-4)], "USD").amountMinor).toBe(-1);
  });
});

describe("multiplyRatio", () => {
  it("computes exact ratios", () => {
    expect(multiplyRatio(money(1000), 1, 4).amountMinor).toBe(250);
    expect(multiplyRatio(money(1000), 3, 4).amountMinor).toBe(750);
  });

  it("half-even: ties go to the even neighbor", () => {
    expect(multiplyRatio(money(5), 1, 2).amountMinor).toBe(2); // 2.5 -> 2
    expect(multiplyRatio(money(15), 1, 10).amountMinor).toBe(2); // 1.5 -> 2
    expect(multiplyRatio(money(25), 1, 10).amountMinor).toBe(2); // 2.5 -> 2
    expect(multiplyRatio(money(35), 1, 10).amountMinor).toBe(4); // 3.5 -> 4
    expect(multiplyRatio(money(-5), 1, 2).amountMinor).toBe(-2); // -2.5 -> -2
    expect(multiplyRatio(money(-15), 1, 10).amountMinor).toBe(-2); // -1.5 -> -2
  });

  it("half-up: ties go away from zero", () => {
    expect(multiplyRatio(money(5), 1, 2, "half-up").amountMinor).toBe(3); // 2.5 -> 3
    expect(multiplyRatio(money(-5), 1, 2, "half-up").amountMinor).toBe(-3); // -2.5 -> -3
    expect(multiplyRatio(money(49), 1, 100, "half-up").amountMinor).toBe(0); // 0.49 -> 0
  });

  it("floor and ceil are directional (toward -inf / +inf)", () => {
    expect(multiplyRatio(money(7), 1, 2, "floor").amountMinor).toBe(3);
    expect(multiplyRatio(money(-7), 1, 2, "floor").amountMinor).toBe(-4);
    expect(multiplyRatio(money(7), 1, 2, "ceil").amountMinor).toBe(4);
    expect(multiplyRatio(money(-7), 1, 2, "ceil").amountMinor).toBe(-3);
  });

  it("normalizes negative denominators", () => {
    expect(multiplyRatio(money(1000), 1, -4).amountMinor).toBe(-250);
  });

  it("rejects bad inputs", () => {
    expect(() => multiplyRatio(money(10), 0.5, 1)).toThrow(TypeError);
    expect(() => multiplyRatio(money(10), 1, 0)).toThrow(RangeError);
    expect(() => multiplyRatio(money(Number.MAX_SAFE_INTEGER), 2, 1)).toThrow(RangeError);
  });
});

describe("allocate", () => {
  it("splits with exact sum (largest remainder)", () => {
    const parts = allocate(money(100), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(100);
  });

  it("respects weights", () => {
    const parts = allocate(money(1000), [50, 30, 20]);
    expect(parts.map((p) => p.amountMinor)).toEqual([500, 300, 200]);
  });

  it("handles negative amounts (allocation of a debt)", () => {
    const parts = allocate(money(-100), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([-34, -33, -33]);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(-100);
  });

  it("zero-weight entries get nothing", () => {
    expect(allocate(money(100), [1, 0]).map((p) => p.amountMinor)).toEqual([100, 0]);
  });

  it("exact sum holds across awkward splits", () => {
    for (const [amount, weights] of [
      [101, [1, 1, 1]],
      [7, [3, 2, 2]],
      [1, [1, 1, 1, 1]],
      [999, [1, 2, 3, 4, 5]],
    ] as const) {
      const parts = allocate(money(amount), [...weights]);
      expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(amount);
    }
  });

  it("rejects bad weights", () => {
    expect(() => allocate(money(100), [])).toThrow(RangeError);
    expect(() => allocate(money(100), [0, 0])).toThrow(RangeError);
    expect(() => allocate(money(100), [-1, 2])).toThrow(RangeError);
    expect(() => allocate(money(100), [Number.NaN])).toThrow(RangeError);
  });
});

describe("minorFromDecimalString / toDecimalString", () => {
  it("parses decimal strings exactly", () => {
    expect(minorFromDecimalString("12.34").amountMinor).toBe(1234);
    expect(minorFromDecimalString("12").amountMinor).toBe(1200);
    expect(minorFromDecimalString("0.05").amountMinor).toBe(5);
    expect(minorFromDecimalString("-0.05").amountMinor).toBe(-5);
    expect(minorFromDecimalString("+1.5").amountMinor).toBe(150);
    expect(minorFromDecimalString(" 7.10 ").amountMinor).toBe(710);
  });

  it("rejects excess precision and garbage", () => {
    expect(() => minorFromDecimalString("12.345")).toThrow(RangeError);
    expect(() => minorFromDecimalString("abc")).toThrow(TypeError);
    expect(() => minorFromDecimalString("1,234.00")).toThrow(TypeError);
    expect(() => minorFromDecimalString("$5")).toThrow(TypeError);
    expect(() => minorFromDecimalString("")).toThrow(TypeError);
  });

  it("round-trips", () => {
    for (const s of ["12.34", "0.05", "-0.05", "0.00", "-12345.67"]) {
      expect(toDecimalString(minorFromDecimalString(s))).toBe(s.replace(/^\+/, ""));
    }
    expect(toDecimalString(money(-5))).toBe("-0.05");
    expect(toDecimalString(money(0))).toBe("0.00");
  });
});
