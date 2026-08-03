import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, unwrap } from "../src/result.js";

describe("Result", () => {
  it("ok wraps a value", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(unwrap(r)).toBe(42);
  });

  it("err wraps an error", () => {
    const r = err(new Error("boom"));
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(() => unwrap(r)).toThrow("boom");
  });

  it("unwrap wraps non-Error errors", () => {
    expect(() => unwrap(err("plain string"))).toThrow("plain string");
  });
});
