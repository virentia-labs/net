import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { readStore, tick } from "../support/runtime";

describe("refresh", () => {
  test("re-runs the last params", async () => {
    let calls = 0;
    const q = query({
      handler: async (id: string) => {
        calls += 1;
        return `${id}:${calls}`;
      },
    });
    const app = scope();
    await scoped(app, () => q("x"));
    await scoped(app, () => q.refresh());
    expect(calls).toBe(2);
    expect(readStore(app, q.data)).toBe("x:2");
  });

  test("re-runs an undefined-payload query", async () => {
    // Gated on hasRun, not on lastParams !== undefined: an undefined payload is a real run.
    let calls = 0;
    const q = query({ handler: async () => `v${(calls += 1)}` });
    const app = scope();
    await scoped(app, () => q(undefined));
    await scoped(app, () => q.refresh());
    expect(calls).toBe(2);
    expect(readStore(app, q.data)).toBe("v2");
  });

  test("uses the latest run's params", async () => {
    const seen: string[] = [];
    const q = query({
      handler: async (id: string) => {
        seen.push(id);
        return id;
      },
    });
    const app = scope();
    await scoped(app, () => q("a"));
    await scoped(app, () => q("b"));
    seen.length = 0;
    await scoped(app, () => q.refresh());
    expect(seen).toEqual(["b"]);
  });

  describe("before the first run", () => {
    test("does nothing", async () => {
      let calls = 0;
      const q = query({
        handler: async () => {
          calls += 1;
          return "x";
        },
      });
      const app = scope();
      await scoped(app, () => q.refresh());
      await tick();
      expect(calls).toBe(0);
      expect(readStore(app, q.data)).toBeNull();
    });
  });

  describe("across scopes", () => {
    test("re-runs only the acting scope's params", async () => {
      let calls = 0;
      const q = query({ handler: async (id: string) => `${id}:${(calls += 1)}` });
      const a = scope();
      const b = scope();
      await scoped(a, () => q("a")); // a:1
      await scoped(b, () => q("b")); // b:2
      await scoped(a, () => q.refresh()); // re-runs "a" → a:3
      expect(readStore(a, q.data)).toBe("a:3"); // refreshed with a's params (not a no-op)
      expect(readStore(b, q.data)).toBe("b:2"); // b was NOT refreshed
    });
  });
});
