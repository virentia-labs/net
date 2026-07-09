import { event, owner, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, trigger } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("trigger lifecycle", () => {
  test("stops future runs after unsubscribe", async () => {
    const fired = event<string>();
    let calls = 0;
    const q = query({
      handler: async (id: string) => {
        calls += 1;
        return id;
      },
    });
    const stop = trigger(q, { on: fired });
    const app = scope();
    await scoped(app, () => fired("a"));
    expect(calls).toBe(1);
    stop();
    await scoped(app, () => fired("b"));
    expect(calls).toBe(1); // no further runs
  });

  test("stops runs when its owner is disposed", async () => {
    const fired = event<string>();
    let calls = 0;
    const q = query({
      handler: async (id: string) => {
        calls += 1;
        return id;
      },
    });
    let dispose!: () => void;
    owner((d) => {
      trigger(q, { on: fired }); // getOwner() is truthy → onCleanup(stop)
      dispose = d;
    });
    const app = scope();
    await scoped(app, () => fired("a"));
    expect(calls).toBe(1);
    dispose();
    await scoped(app, () => fired("b"));
    expect(calls).toBe(1); // owner cleanup stopped the trigger
  });

  test("runs every trigger bound to one target", async () => {
    const a = event<string>();
    const b = event<string>();
    const seen: string[] = [];
    const q = query({
      handler: async (id: string) => {
        seen.push(id);
        return id;
      },
    });
    trigger(q, { on: a, params: (x: string) => `a:${x}` });
    trigger(q, { on: b, params: (x: string) => `b:${x}` });
    const app = scope();
    await scoped(app, () => a("1"));
    await scoped(app, () => b("2"));
    expect(seen).toEqual(["a:1", "b:2"]);
  });

  describe("an inline config trigger", () => {
    test("runs the query when it fires", async () => {
      const opened = event<string>();
      const q = query({
        handler: async (id: string) => `user:${id}`,
        trigger: { on: opened },
      });
      const app = scope();
      await scoped(app, () => opened("inline"));
      expect(readStore(app, q.data)).toBe("user:inline");
    });

    test("runs the query for each trigger in an array", async () => {
      const a = event<string>();
      const b = event<string>();
      const q = query({
        handler: async (id: string) => id,
        trigger: [
          { on: a, params: (x: string) => `a:${x}` },
          { on: b, params: (x: string) => `b:${x}` },
        ],
      });
      const app = scope();
      await scoped(app, () => a("1"));
      expect(readStore(app, q.data)).toBe("a:1");
      await scoped(app, () => b("2"));
      expect(readStore(app, q.data)).toBe("b:2");
    });
  });
});
