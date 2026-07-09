import { getCurrentScope, scope, scoped, store } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { defer } from "../support/harness";
import { collect, readStore } from "../support/runtime";

describe("a query run", () => {
  test("publishes the resolved value to data", async () => {
    const q = query({ handler: async (id: string) => `user:${id}` });
    const app = scope();
    await scoped(app, () => q("42"));
    expect(readStore(app, q.data)).toBe("user:42");
  });

  test("emits the resolved value on doneData", async () => {
    const q = query({ handler: async (id: string) => `user:${id}` });
    const done = collect(q.doneData);
    const app = scope();
    await scoped(app, () => q("42"));
    expect(done).toEqual(["user:42"]);
  });

  describe("while the handler is in flight", () => {
    test("stays pending until the run settles", async () => {
      const gate = defer<string>();
      const q = query({ handler: () => gate.promise });
      const app = scope();
      let p!: Promise<unknown>;
      scoped(app, () => {
        p = q("x");
      });

      expect(readStore(app, q.pending)).toBe(true);
      gate.resolve("done");
      await p;
      expect(readStore(app, q.pending)).toBe(false);
    });
  });

  describe("the handler context", () => {
    test("carries an abort signal", async () => {
      let seenSignal: AbortSignal | undefined;
      const q = query({
        handler: async (_: void, ctx) => {
          seenSignal = ctx.signal;
          return "ok";
        },
      });
      await scoped(scope(), () => q(undefined));
      expect(seenSignal).toBeInstanceOf(AbortSignal);
    });

    test("carries the run's scope on ctx.scope", async () => {
      let sameScope = false;
      const app = scope();
      const q = query({
        handler: async (_: void, ctx) => {
          sameScope = ctx.scope === app;
          return "ok";
        },
      });
      await scoped(app, () => q(undefined));
      expect(sameScope).toBe(true);
    });

    test("runs the handler under the ambient run scope", async () => {
      const app = scope();
      let ambientMatched = false;
      const q = query({
        handler: async () => {
          ambientMatched = getCurrentScope() === app;
          return "x";
        },
      });
      await scoped(app, () => q(undefined));
      expect(ambientMatched).toBe(true);
    });
  });

  test("writes a handler-set store into the run's scope only", async () => {
    const flag = store(false);
    const app = scope();
    const q = query({
      handler: async () => {
        flag.value = true;
        return "x";
      },
    });
    await scoped(app, () => q(undefined));
    expect(readStore(app, flag)).toBe(true);
    expect(readStore(scope(), flag)).toBe(false);
  });
});
