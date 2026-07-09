import { scope, scoped, store } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { mutation, retry } from "../../lib/index";
import { defer } from "../support/harness";
import { readStore, tick } from "../support/runtime";

describe("optimistic update", () => {
  test("applies before the handler settles", async () => {
    const items = store<string[]>([]);
    const gate = defer<string>();
    const add = mutation({
      handler: () => gate.promise,
      optimistic: {
        update: (name: string) => {
          items.value = [...items.value, name];
        },
        rollback: (name: string) => {
          items.value = items.value.filter((i) => i !== name);
        },
      },
    });
    const app = scope();
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = add("milk");
    });
    expect(readStore(app, items)).toEqual(["milk"]); // applied synchronously
    gate.resolve("ok");
    await p;
  });

  test("stays applied on success", async () => {
    const items = store<string[]>([]);
    const add = mutation({
      handler: async (name: string) => name,
      optimistic: {
        update: (name: string) => {
          items.value = [...items.value, name];
        },
        rollback: (name: string) => {
          items.value = items.value.filter((i) => i !== name);
        },
      },
    });
    const app = scope();
    await scoped(app, () => add("milk"));
    expect(readStore(app, items)).toEqual(["milk"]);
  });

  test("rolls back once after the final failure", async () => {
    const items = store<string[]>([]);
    const rollbacks: string[] = [];
    const add = mutation({
      handler: async (): Promise<string> => {
        throw new Error("server rejected");
      },
      optimistic: {
        update: (name: string) => {
          items.value = [...items.value, name];
        },
        rollback: (name: string) => {
          rollbacks.push(name);
          items.value = items.value.filter((i) => i !== name);
        },
      },
    });
    const app = scope();
    await scoped(app, () => add("milk")).catch(() => {});
    expect(rollbacks).toEqual(["milk"]); // fired once, not zero or twice
    expect(readStore(app, items)).toEqual([]); // rolled back
  });

  describe("with retry", () => {
    test("applies once, reverting once after the last failure", async () => {
      const items = store<string[]>([]);
      let attempts = 0;
      const updates: string[] = [];
      const rollbacks: string[] = [];
      const add = mutation({
        handler: async (): Promise<string> => {
          attempts += 1;
          throw new Error("down");
        },
        optimistic: {
          update: (name: string) => {
            updates.push(name);
            items.value = [...items.value, name];
          },
          rollback: (name: string) => {
            rollbacks.push(name);
            items.value = items.value.filter((i) => i !== name);
          },
        },
        use: [retry({ times: 2, delay: 0 })],
      });
      const app = scope();
      await scoped(app, () => add("milk")).catch(() => {});
      expect(attempts).toBe(3); // 1 + 2 retries
      expect(updates).toEqual(["milk"]); // applied once (scheduler stage, outside retry)
      expect(rollbacks).toEqual(["milk"]); // reverted once, after the last failure
      expect(readStore(app, items)).toEqual([]);
    });
  });

  test("applies the update only in the run's scope", async () => {
    const items = store<string[]>([]);
    let seenScope: unknown;
    const add = mutation({
      handler: async (name: string) => name, // success → update stays applied (distinct from other)
      optimistic: {
        update: (name: string, ctx) => {
          seenScope = ctx.scope;
          items.value = [...items.value, name];
        },
        rollback: () => {},
      },
    });
    const app = scope();
    const other = scope();
    await scoped(app, () => add("milk"));
    expect(seenScope).toBe(app);
    expect(readStore(app, items)).toEqual(["milk"]); // applied in app
    expect(readStore(other, items)).toEqual([]); // NOT in another scope
  });

  describe("KNOWN LIMITATION: a signal-ignoring handler", () => {
    test("leaks the optimistic update on reset", async () => {
      // The optimistic rollback runs in the operator's catch, which only fires when `next` settles.
      // A handler that ignores its abort signal never settles after reset() aborts it, so rollback
      // never runs and the optimistic update leaks. Cooperative cancellation is required to recover.
      const items = store<string[]>([]);
      const never = defer<string>(); // never resolves; the handler ignores the signal
      const add = mutation({
        handler: () => never.promise,
        optimistic: {
          update: (name: string) => {
            items.value = [...items.value, name];
          },
          rollback: (name: string) => {
            items.value = items.value.filter((i) => i !== name);
          },
        },
      });
      const app = scope();
      let p!: Promise<unknown>;
      scoped(app, () => {
        p = add("milk");
      });
      p.catch(() => {}); // attach before reset aborts it, so the rejection is never unhandled
      expect(readStore(app, items)).toEqual(["milk"]);
      await scoped(app, () => add.reset());
      await tick();
      expect(readStore(app, items)).toEqual(["milk"]); // leaked (no rollback)
      never.resolve("late"); // let the dangling run settle
    });
  });
});
