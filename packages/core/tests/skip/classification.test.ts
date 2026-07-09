import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, isSkip, query, SkipSignal, type Operator } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { collect, readStore } from "../support/runtime";

// The error store admits real errors and filters cancellations (skips + AbortError-named). A
// TimeoutError is a genuine deadline breach, so it must NOT be filtered.

describe("a superseded takeLatest run", () => {
  test("keeps the error store null", async () => {
    const h = reasonHarness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b");
    });
    await pa.catch(() => {});
    expect(readStore(app, q.error)).toBeNull();
    expect(isSkip(h.aborted[0]?.reason)).toBe(true);
    h.resolve("b", "B");
    await pb;
    expect(readStore(app, q.data)).toBe("B");
  });

  test("still emits the SkipSignal on failData", async () => {
    const h = reasonHarness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const skips = collect(q.failData);
    const app = scope();
    let pa!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      q("b").catch(() => {});
    });
    await pa.catch(() => {});
    expect(skips.some((e) => isSkip(e))).toBe(true);
  });
});

describe("a thrown SkipSignal", () => {
  test("reaches failData while preserving prior data and leaving the error store null", async () => {
    let skip = false;
    const gate: Operator<any, any> = {
      name: "gate",
      stage: "executor",
      wrapHandler(next) {
        return async (p, c) => {
          if (skip) throw new SkipSignal("cache-hit");
          return next(p, c);
        };
      },
    };
    const q = query({ handler: async () => "data", use: [gate] });
    const fails = collect(q.failData);
    const app = scope();
    await scoped(app, () => q(undefined)); // success first → data is "data" (not null)
    expect(readStore(app, q.data)).toBe("data");
    skip = true;
    await scoped(app, () => q(undefined)).catch(() => {}); // now skipped
    expect(isSkip(fails[0])).toBe(true); // raw channel sees the skip
    expect(readStore(app, q.error)).toBeNull(); // error store filters it
    expect(readStore(app, q.data)).toBe("data"); // prior data preserved, not clobbered
  });
});

describe("the error store filter", () => {
  test("admits a TimeoutError-named rejection", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        const e = new Error("slow");
        e.name = "TimeoutError"; // a genuine deadline breach, not a cancellation
        throw e;
      },
    });
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect((readStore(app, q.error) as Error).name).toBe("TimeoutError");
  });

  test("rejects an AbortError-named rejection", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        const e = new Error("cancelled");
        e.name = "AbortError";
        throw e;
      },
    });
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(readStore(app, q.error)).toBeNull(); // isAbortReason → filtered
  });

  test("keeps skip and abort reasons out but admits a TimeoutError, across effects", async () => {
    const thrower = (make: () => unknown): Operator<any, any> => ({
      name: "thrower",
      stage: "executor",
      wrapHandler() {
        return async () => {
          throw make();
        };
      },
    });
    const named = (name: string): Error => {
      const e = new Error(name);
      e.name = name;
      return e;
    };
    const app = scope();
    const skipQ = query({ handler: async () => "x", use: [thrower(() => new SkipSignal("barrier"))] });
    const abortQ = query({ handler: async () => "x", use: [thrower(() => named("AbortError"))] });
    const timeoutQ = query({ handler: async () => "x", use: [thrower(() => named("TimeoutError"))] });
    await scoped(app, () => skipQ(undefined)).catch(() => {});
    await scoped(app, () => abortQ(undefined)).catch(() => {});
    await scoped(app, () => timeoutQ(undefined)).catch(() => {});
    expect(readStore(app, skipQ.error)).toBeNull();
    expect(readStore(app, abortQ.error)).toBeNull();
    expect((readStore(app, timeoutQ.error) as Error).name).toBe("TimeoutError");
  });
});
