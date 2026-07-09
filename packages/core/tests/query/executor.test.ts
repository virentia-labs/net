import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { collect, readStore } from "../support/runtime";

describe("the query executor", () => {
  describe("with neither handler nor executor", () => {
    test("rejects with a no-handler error", async () => {
      const q = query<void, string>({} as never);
      const errors = collect(q.failData);
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect((errors[0] as Error).message).toMatch(/no handler/);
    });
  });

  describe("with a custom executor", () => {
    test("bypasses the config handler", async () => {
      let handlerRan = false;
      const q = query({
        handler: async () => {
          handlerRan = true;
          return "from-handler";
        },
        executor: async () => "from-executor",
      });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("from-executor");
      expect(handlerRan).toBe(false);
    });

    test("receives the run context (mapped params, signal, scope, handler)", async () => {
      let seen: unknown;
      const app = scope();
      const q = query({
        params: (raw: string) => raw.length,
        handler: async () => "unused",
        executor: async (params, ctx) => {
          seen = {
            params,
            signalIsAbort: ctx.signal instanceof AbortSignal,
            scopeMatches: ctx.scope === app,
            hasHandler: typeof ctx.handler === "function",
          };
          return "ok";
        },
      });
      await scoped(app, () => q("abcd"));
      expect(seen).toEqual({ params: 4, signalIsAbort: true, scopeMatches: true, hasHandler: true });
    });
  });
});
