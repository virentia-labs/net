import { event, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, isSkip, query, trigger } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { readStore, tick } from "../support/runtime";

describe("trigger robustness", () => {
  test("swallows a superseded run's rejection", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void rejections.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const h = reasonHarness<"a" | "b">();
      const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
      const bump = event<"a" | "b">();
      trigger(q, { on: bump, params: (x: "a" | "b") => x });
      const app = scope();
      scoped(app, () => {
        bump("a").catch(() => {});
      });
      scoped(app, () => {
        bump("b").catch(() => {}); // supersedes "a" → its run rejects with a SkipSignal
      });
      await tick();
      await new Promise((r) => setTimeout(r, 0)); // let any floating rejection surface
      expect(isSkip(h.aborted[0]?.reason)).toBe(true); // "a" was actually superseded
      expect(rejections).toEqual([]); // ...and the trigger's .catch(noop) swallowed it
      h.resolve("b");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  describe("when a params mapper throws", () => {
    test("keeps sibling triggers running", async () => {
      const e = event<number>();
      const good = query({ handler: async (x: number) => `good:${x}` });
      trigger(good, {
        on: e,
        params: () => {
          throw new Error("map boom");
        },
      });
      trigger(good, { on: e }); // sibling on the same event
      const app = scope();
      await scoped(app, () => e(1)); // must not throw
      expect(readStore(app, good.data)).toBe("good:1"); // sibling ran
    });
  });

  describe("when a filter throws", () => {
    test("keeps sibling triggers running", async () => {
      const e = event<number>();
      const q = query({ handler: async (x: number) => x });
      const good = query({ handler: async (x: number) => `good:${x}` });
      trigger(q, {
        on: e,
        filter: () => {
          throw new Error("filter boom");
        },
      });
      trigger(good, { on: e }); // sibling on the same event
      const app = scope();
      await scoped(app, () => e(1)); // must not throw
      expect(readStore(app, q.data)).toBeNull(); // the throwing-filter trigger did not run
      expect(readStore(app, good.data)).toBe("good:1"); // sibling ran despite the throw
    });
  });
});
