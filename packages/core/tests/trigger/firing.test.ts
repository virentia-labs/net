import { event, scope, scoped, store } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, trigger } from "../../lib/index";
import { readStore, tick } from "../support/runtime";

describe("a trigger", () => {
  describe("with no params mapper", () => {
    test("forwards the payload to the query", async () => {
      const opened = event<string>();
      const q = query({ handler: async (id: string) => `user:${id}` });
      trigger(q, { on: opened });
      const app = scope();
      await scoped(app, () => opened("9"));
      expect(readStore(app, q.data)).toBe("user:9");
    });
  });

  describe("with a params mapper", () => {
    test("maps the payload before the run", async () => {
      const opened = event<{ id: string }>();
      const q = query({ handler: async (id: string) => `user:${id}` });
      trigger(q, { on: opened, params: (payload: { id: string }) => payload.id });
      const app = scope();
      await scoped(app, () => opened({ id: "42" }));
      expect(readStore(app, q.data)).toBe("user:42");
    });

    test("reads reactive state when it takes no argument", async () => {
      const routeId = store("7");
      const ping = event<void>();
      const q = query({ handler: async (id: string) => `user:${id}` });
      trigger(q, { on: ping, params: () => routeId.value });
      const app = scope();
      scoped(app, () => {
        routeId.value = "13"; // per-scope reactive state
      });
      await scoped(app, () => ping());
      expect(readStore(app, q.data)).toBe("user:13");
    });
  });

  test("runs when a store source changes, receiving the new value", async () => {
    const src = store(0);
    const q = query({ handler: async (n: number) => `n:${n}` });
    trigger(q, { on: src, params: (n: number) => n });
    const app = scope();
    scoped(app, () => {
      src.value = 5;
    });
    await tick();
    expect(readStore(app, q.data)).toBe("n:5");
  });

  describe("with an on array", () => {
    test("runs when any unit fires", async () => {
      const a = event<string>();
      const b = event<string>();
      const q = query({ handler: async (id: string) => id });
      trigger(q, { on: [a, b] });
      const app = scope();
      await scoped(app, () => a("from-a"));
      expect(readStore(app, q.data)).toBe("from-a");
      await scoped(app, () => b("from-b"));
      expect(readStore(app, q.data)).toBe("from-b");
    });
  });
});
