import { describe, expect, test } from "vitest";

import { isSkip, SkipSignal, type SkipReason } from "../../lib/index";

describe("SkipSignal", () => {
  test("reflects its reason across name, message and prototype", () => {
    const s = new SkipSignal("concurrency");
    expect(s).toBeInstanceOf(Error);
    expect(s.name).toBe("SkipSignal");
    expect(s.reason).toBe("concurrency");
    expect(s.message).toContain("concurrency");
  });

  test("round-trips every documented reason", () => {
    const reasons: SkipReason[] = ["cache-hit", "barrier", "concurrency"];
    for (const r of reasons) {
      expect(new SkipSignal(r).reason).toBe(r);
    }
  });
});

describe("isSkip", () => {
  test("returns true for skip-shaped values", () => {
    expect(isSkip(new SkipSignal("barrier"))).toBe(true);
    // duck-typed: isSkip checks the `isNetSkip` brand, not the class
    expect(isSkip({ isNetSkip: true })).toBe(true);
  });

  test("returns false for real errors and non-skip values", () => {
    expect(isSkip(new Error("boom"))).toBe(false);
    expect(isSkip(null)).toBe(false);
    expect(isSkip(undefined)).toBe(false);
    expect(isSkip({})).toBe(false);
    expect(isSkip("skip")).toBe(false);
    expect(isSkip(0)).toBe(false);
    expect(isSkip({ isNetSkip: false })).toBe(false);
  });
});
