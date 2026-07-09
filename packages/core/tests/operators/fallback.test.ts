import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { fallback, query, SkipSignal } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { readStore } from "../support/runtime";

describe("fallback", () => {
  test("recovers a failed run with a static value", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("down");
      },
      use: [fallback("cached")],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(readStore(app, q.data)).toBe("cached");
  });

  test("computes the fallback from the error and the mapped params", async () => {
    const q = query({
      params: (raw: string) => raw.length,
      handler: async (): Promise<string> => {
        throw new Error("boom");
      },
      use: [fallback((error, len) => `${len}:${(error as Error).message}`)],
    });
    const app = scope();
    await scoped(app, () => q("abcd"));
    expect(readStore(app, q.data)).toBe("4:boom");
  });

  describe("cancellations pass through unrecovered", () => {
    test("does not recover a SkipSignal", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new SkipSignal("cache-hit");
        },
        use: [fallback("fb")],
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect(readStore(app, q.data)).toBeNull(); // not recovered
    });

    test("does not recover an aborted run", async () => {
      const h = reasonHarness<"x">();
      const q = query({ handler: h.handler, use: [fallback("fb")] });
      const app = scope();
      let p!: Promise<unknown>;
      scoped(app, () => {
        p = q("x");
      });
      scoped(app, () => q.abort());
      await p.catch(() => {});
      expect(readStore(app, q.data)).toBeNull(); // abort not masked by fallback
    });

    test("does not recover an AbortError-named rejection with a live signal", async () => {
      // ctx.signal is NOT aborted here, so only fallback's isAbortReason clause can classify this
      // as a cancellation and refuse to recover it.
      const q = query({
        handler: async (): Promise<string> => {
          const e = new Error("external abort");
          e.name = "AbortError";
          throw e;
        },
        use: [fallback("fb")],
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect(readStore(app, q.data)).toBeNull(); // not recovered
    });
  });
});
