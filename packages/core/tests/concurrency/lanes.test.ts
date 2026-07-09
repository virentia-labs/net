import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";
import { tick } from "../support/runtime";

describe("concurrency lanes", () => {
  test("run per-key lanes independently", async () => {
    const h = harness<string>();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "takeLatest", key: (id: string) => id })],
    });
    const app = scope();
    scoped(app, () => {
      q("x").catch(() => {});
      q("y").catch(() => {});
    });
    expect(h.started).toEqual(["x", "y"]);
    h.resolve("x");
    h.resolve("y");
    await tick();
    expect(h.settled.sort()).toEqual(["x", "y"]);
  });

  test("abort a prior run sharing the same key", async () => {
    const h = harness<string>();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "takeLatest", key: (id: string) => id.charAt(0) })],
    });
    const app = scope();
    let p1!: Promise<unknown>;
    scoped(app, () => {
      p1 = q("a1"); // key "a"
      q("a2").catch(() => {}); // key "a" → aborts a1
    });
    await expect(p1).rejects.toThrow("aborted:a1");
  });

  test("receive mapped params in the lane key", async () => {
    const seen: number[] = [];
    const q = query({
      params: (raw: string) => raw.length,
      handler: async () => "ok",
      use: [
        concurrency({
          strategy: "takeLatest",
          key: (len: number) => {
            seen.push(len);
            return len;
          },
        }),
      ],
    });
    const app = scope();
    scoped(app, () => {
      q("abc").catch(() => {});
    });
    expect(seen).toEqual([3]);
  });

  describe("when concurrency has no key", () => {
    test("falls back to the query key (ctx.key) as the lane", async () => {
      const h = harness<string>();
      const q = query({
        handler: h.handler,
        key: (id: string) => id,
        use: [concurrency({ strategy: "takeLatest" })],
      });
      const app = scope();
      scoped(app, () => {
        q("x").catch(() => {});
        q("y").catch(() => {});
      });
      expect(h.started).toEqual(["x", "y"]);
      h.resolve("x");
      h.resolve("y");
      await tick();
      expect(h.settled.sort()).toEqual(["x", "y"]);
    });
  });
});
