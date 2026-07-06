import { event, scope, scoped, store } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { mutation, query, trigger } from "../lib/index";

describe("trigger", () => {
  test("runs the query when the bound unit fires, mapping the payload", async () => {
    const q = query({
      params: (raw: { id: string }) => raw.id,
      handler: async (id: string) => `user:${id}`,
    });

    const opened = event<{ id: string }>();
    trigger(q, { on: opened, params: (payload: { id: string }) => ({ id: payload.id }) });

    const app = scope();
    await scoped(app, () => opened({ id: "9" }));

    expect(scoped(app, () => q.data.value)).toBe("user:9");
  });

  test("filter guards the trigger", async () => {
    let calls = 0;
    const q = query({
      handler: async (n: number) => {
        calls += 1;
        return n;
      },
    });

    const fired = event<number>();
    trigger(q, { on: fired, filter: (n: number) => n > 0 });

    const app = scope();
    await scoped(app, () => fired(-1));
    expect(calls).toBe(0);

    await scoped(app, () => fired(5));
    expect(calls).toBe(1);
    expect(scoped(app, () => q.data.value)).toBe(5);
  });

  test("inline config.trigger is sugar over trigger()", async () => {
    const ping = event<string>();
    const q = query({
      handler: async (msg: string) => msg.toUpperCase(),
      trigger: { on: ping },
    });

    const app = scope();
    await scoped(app, () => ping("hi"));

    expect(scoped(app, () => q.data.value)).toBe("HI");
  });
});

describe("mutation", () => {
  test("invalidates a query on success (re-runs it with its last params)", async () => {
    let loads = 0;
    const list = query({
      handler: async (page: number) => {
        loads += 1;
        return `page-${page}`;
      },
    });

    const addItem = mutation({
      handler: async (name: string) => name,
      invalidates: [list],
    });

    const app = scope();
    await scoped(app, () => list(1));
    expect(loads).toBe(1);

    await scoped(app, () => addItem("milk"));
    // invalidation re-ran the list with its last params (page 1).
    expect(loads).toBe(2);
    expect(scoped(app, () => list.data.value)).toBe("page-1");
  });

  test("optimistic update applies immediately and rolls back on failure", async () => {
    const items = store<string[]>([]);

    const failing = mutation({
      handler: async (): Promise<string> => {
        throw new Error("server rejected");
      },
      optimistic: {
        update: (name: string) => void (items.value = [...items.value, name]),
        rollback: (name: string) =>
          void (items.value = items.value.filter((item) => item !== name)),
      },
    });

    const app = scope();
    await scoped(app, () => failing("ghost")).catch(() => {});

    expect(scoped(app, () => items.value)).toEqual([]); // rolled back
  });

  test("optimistic update persists on success", async () => {
    const items = store<string[]>([]);

    const addItem = mutation({
      handler: async (name: string) => name,
      optimistic: {
        update: (name: string) => void (items.value = [...items.value, name]),
        rollback: (name: string) =>
          void (items.value = items.value.filter((item) => item !== name)),
      },
    });

    const app = scope();
    await scoped(app, () => addItem("milk"));

    expect(scoped(app, () => items.value)).toEqual(["milk"]);
  });
});
