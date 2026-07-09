import { event, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, mutation } from "../../lib/index";
import { defer } from "../support/harness";
import { collect, tick } from "../support/runtime";

describe("a mutation submit", () => {
  test("emits started once", async () => {
    const add = mutation({ handler: async (n: number) => n });
    const starts = collect(add.started);
    await scoped(scope(), () => add(1));
    expect(starts.length).toBe(1);
  });

  describe("with a queue strategy", () => {
    test("serializes submits", async () => {
      const order: string[] = [];
      const h = { a: defer<string>(), b: defer<string>() };
      const add = mutation({
        handler: async (name: "a" | "b") => {
          order.push(`start:${name}`);
          const v = await h[name].promise;
          order.push(`done:${name}`);
          return v;
        },
        use: [concurrency({ strategy: "queue" })],
      });
      const app = scope();
      scoped(app, () => {
        add("a").catch(() => {});
        add("b").catch(() => {});
      });
      await tick();
      expect(order).toEqual(["start:a"]); // b waits
      h.a.resolve("a");
      await tick();
      h.b.resolve("b");
      await tick();
      expect(order).toEqual(["start:a", "done:a", "start:b", "done:b"]);
    });
  });

  describe("with an inline trigger", () => {
    test("runs the mutation when the trigger fires", async () => {
      const submit = event<string>();
      const seen: string[] = [];
      mutation({
        handler: async (name: string) => {
          seen.push(name);
          return name;
        },
        trigger: { on: submit },
      });
      await scoped(scope(), () => submit("draft"));
      expect(seen).toEqual(["draft"]);
    });

    test("runs the mutation for each trigger in an array", async () => {
      const a = event<string>();
      const b = event<string>();
      const seen: string[] = [];
      mutation({
        handler: async (n: string) => {
          seen.push(n);
          return n;
        },
        trigger: [{ on: a }, { on: b }],
      });
      const app = scope();
      await scoped(app, () => a("1"));
      await scoped(app, () => b("2"));
      expect(seen).toEqual(["1", "2"]);
    });
  });
});
