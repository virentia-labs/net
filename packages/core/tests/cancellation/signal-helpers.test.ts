import { describe, expect, test } from "vitest";

import { childController, isAbortReason, raceAbort } from "../../lib/shared/signal";

describe("raceAbort", () => {
  describe("when the signal is already aborted", () => {
    test("rejects synchronously with the abort reason", async () => {
      const ac = new AbortController();
      const reason = new Error("already");
      ac.abort(reason);
      // The promise resolves, but an already-aborted signal wins synchronously.
      await expect(raceAbort(Promise.resolve("value"), ac.signal)).rejects.toBe(reason);
    });
  });

  test("resolves with the value when the promise settles before any abort", async () => {
    const ac = new AbortController();
    await expect(raceAbort(Promise.resolve("ok"), ac.signal)).resolves.toBe("ok");
  });

  test("propagates the promise's own rejection when the signal never aborts", async () => {
    const ac = new AbortController();
    await expect(raceAbort(Promise.reject(new Error("boom")), ac.signal)).rejects.toThrow("boom");
  });

  test("rejects with signal.reason before the source settles", async () => {
    const ac = new AbortController();
    let resolveLate!: (v: string) => void;
    const pending = new Promise<string>((r) => {
      resolveLate = r;
    });
    const raced = raceAbort(pending, ac.signal);
    const reason = new Error("cancelled");
    ac.abort(reason);
    await expect(raced).rejects.toBe(reason);
    resolveLate("late"); // settling the source afterwards is harmless (already rejected)
    await expect(raced).rejects.toBe(reason);
  });
});

describe("childController", () => {
  test("pre-aborts the child from a pre-aborted parent, carrying the reason", () => {
    const parent = new AbortController();
    const reason = new Error("parent-gone");
    parent.abort(reason);
    const child = childController(parent.signal);
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe(reason);
  });

  test("propagates a later parent abort to the child", () => {
    const parent = new AbortController();
    const child = childController(parent.signal);
    expect(child.signal.aborted).toBe(false);
    const reason = new Error("late-parent");
    parent.abort(reason);
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe(reason);
  });
});

describe("isAbortReason", () => {
  test("matches only an AbortError-named reason", () => {
    const abortErr = new Error("x");
    abortErr.name = "AbortError";
    const timeoutErr = new Error("x");
    timeoutErr.name = "TimeoutError";
    expect(isAbortReason(abortErr)).toBe(true);
    expect(isAbortReason(timeoutErr)).toBe(false);
    expect(isAbortReason(new Error("x"))).toBe(false);
    expect(isAbortReason(null)).toBe(false);
    expect(isAbortReason("AbortError")).toBe(false);
  });
});
