import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { mutation, query } from "../../lib/index";
import { readStore, tick } from "../support/runtime";

describe("invalidation", () => {
  test("re-runs an invalidated query with its last params", async () => {
    let listLoads = 0;
    const list = query({
      handler: async (page: number) => {
        listLoads += 1;
        return `page-${page}:${listLoads}`;
      },
    });
    const add = mutation({ handler: async () => "added", invalidates: list });
    const app = scope();
    await scoped(app, () => list(1));
    expect(listLoads).toBe(1);
    await scoped(app, () => add(undefined));
    expect(listLoads).toBe(2); // invalidated → re-ran with last params (page 1)
    expect(readStore(app, list.data)).toBe("page-1:2");
  });

  test("re-runs a param-less invalidated query", async () => {
    let listLoads = 0;
    const list = query({ handler: async () => `load-${(listLoads += 1)}` });
    const add = mutation({ handler: async () => "added", invalidates: [list] });
    const app = scope();
    await scoped(app, () => list(undefined));
    expect(listLoads).toBe(1);
    await scoped(app, () => add(undefined));
    expect(listLoads).toBe(2);
  });

  test("re-runs every target in the list", async () => {
    let a = 0;
    let b = 0;
    const qa = query({ handler: async () => `a${(a += 1)}` });
    const qb = query({ handler: async () => `b${(b += 1)}` });
    const add = mutation({ handler: async () => "ok", invalidates: [qa, qb] });
    const app = scope();
    await scoped(app, () => qa(undefined));
    await scoped(app, () => qb(undefined));
    await scoped(app, () => add(undefined));
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  describe("when the mutation fails", () => {
    test("does not invalidate", async () => {
      let listLoads = 0;
      const list = query({ handler: async () => `load-${(listLoads += 1)}` });
      const failing = mutation({
        handler: async (): Promise<string> => {
          throw new Error("x");
        },
        invalidates: [list],
      });
      const app = scope();
      await scoped(app, () => list(undefined));
      expect(listLoads).toBe(1);
      await scoped(app, () => failing(undefined)).catch(() => {});
      await tick();
      expect(listLoads).toBe(1); // not invalidated
    });
  });

  describe("across scopes", () => {
    test("refreshes only the acting scope's target", async () => {
      let loads = 0;
      const list = query({
        handler: async (id: string) => {
          loads += 1;
          return `${id}:${loads}`;
        },
      });
      const add = mutation({ handler: async () => "ok", invalidates: [list] });
      const a = scope();
      const b = scope();
      await scoped(a, () => list("a"));
      await scoped(b, () => list("b"));
      expect(loads).toBe(2);
      await scoped(a, () => add(undefined)); // invalidate in scope a
      expect(loads).toBe(3); // only a refreshed
      expect(readStore(a, list.data)).toBe("a:3");
      expect(readStore(b, list.data)).toBe("b:2"); // b untouched
    });
  });
});
