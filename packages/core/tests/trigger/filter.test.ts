import { event, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, trigger } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("a trigger filter", () => {
  test("runs only when it passes", async () => {
    const fired = event<number>();
    let calls = 0;
    const q = query({
      handler: async (n: number) => {
        calls += 1;
        return n;
      },
    });
    trigger(q, { on: fired, filter: (n: number) => n > 0 });
    const app = scope();
    await scoped(app, () => fired(-1));
    expect(calls).toBe(0);
    await scoped(app, () => fired(5));
    expect(calls).toBe(1);
    expect(readStore(app, q.data)).toBe(5);
  });

  test("receives the raw payload, before params", async () => {
    const seen: Array<{ where: string; payload: unknown }> = [];
    const fired = event<{ v: number }>();
    const q = query({ handler: async (n: number) => n });
    trigger(q, {
      on: fired,
      filter: (p: { v: number }) => {
        seen.push({ where: "filter", payload: p });
        return true;
      },
      params: (p: { v: number }) => {
        seen.push({ where: "params", payload: p });
        return p.v;
      },
    });
    await scoped(scope(), () => fired({ v: 3 }));
    expect(seen).toEqual([
      { where: "filter", payload: { v: 3 } },
      { where: "params", payload: { v: 3 } },
    ]);
  });
});
