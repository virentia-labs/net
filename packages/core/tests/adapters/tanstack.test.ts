import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { tanstackExecutor, type TanstackQueryClientLike } from "../../lib/adapters/tanstack";
import { readStore, tick } from "../support/runtime";

describe("tanstackExecutor", () => {
  test("routes the handler through fetchQuery and returns its result", async () => {
    const calls: Array<{ queryKey: readonly unknown[]; staleTime?: number }> = [];
    const client: TanstackQueryClientLike = {
      fetchQuery: async ({ queryKey, queryFn, staleTime }) => {
        calls.push({ queryKey, staleTime });
        return queryFn();
      },
    };
    const q = query({
      handler: async (id: string) => `user:${id}`,
      executor: tanstackExecutor(() => client, {
        queryKey: (id) => ["user", id],
        staleTime: 5000,
      }),
    });
    const app = scope();
    await scoped(app, () => q("1"));
    expect(readStore(app, q.data)).toBe("user:1");
    expect(calls).toEqual([{ queryKey: ["user", "1"], staleTime: 5000 }]);
  });

  test("defaults the queryKey to [name ?? 'net', params]", async () => {
    const keys: Array<readonly unknown[]> = [];
    const client: TanstackQueryClientLike = {
      fetchQuery: async ({ queryKey, queryFn }) => {
        keys.push(queryKey);
        return queryFn();
      },
    };
    const named = query({
      name: "users",
      handler: async (id: string) => id,
      executor: tanstackExecutor(() => client),
    });
    const anon = query({
      handler: async (id: string) => id,
      executor: tanstackExecutor(() => client),
    });
    const app = scope();
    await scoped(app, () => named("7"));
    await scoped(app, () => anon("8"));
    expect(keys[0]).toEqual(["users", "7"]);
    expect(keys[1]).toEqual(["net", "8"]);
  });

  test("forwards the run scope to the query function", async () => {
    let scopeMatches = false;
    const app = scope();
    const client: TanstackQueryClientLike = {
      fetchQuery: async ({ queryFn }) => queryFn(),
    };
    const q = query({
      handler: (_: void, ctx) => {
        scopeMatches = ctx.scope === app;
        return Promise.resolve("ok");
      },
      executor: tanstackExecutor(() => client),
    });
    await scoped(app, () => q(undefined));
    expect(scopeMatches).toBe(true);
  });

  test("forwards the run's live abort signal to the query function", async () => {
    let captured: AbortSignal | undefined;
    const app = scope();
    const client: TanstackQueryClientLike = {
      fetchQuery: async ({ queryFn }) => queryFn(),
    };
    const q = query({
      handler: (_: void, ctx) => {
        captured = ctx.signal;
        return new Promise<string>(() => {}); // stay pending so we can abort it
      },
      executor: tanstackExecutor(() => client),
    });
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = q(undefined);
    });
    p.catch(() => {});
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured!.aborted).toBe(false);
    scoped(app, () => q.abort()); // net cancels → the forwarded signal must flip
    await tick();
    expect(captured!.aborted).toBe(true);
  });

  test("reads the client on every run", async () => {
    let built = 0;
    const client: TanstackQueryClientLike = { fetchQuery: async ({ queryFn }) => queryFn() };
    const q = query({
      handler: async () => "ok",
      executor: tanstackExecutor(() => {
        built += 1;
        return client;
      }),
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    await scoped(app, () => q(undefined));
    expect(built).toBe(2); // getClient() called per run, not once at build
  });

  describe("with no handler", () => {
    test("rejects with a helpful error", async () => {
      const client: TanstackQueryClientLike = { fetchQuery: async ({ queryFn }) => queryFn() };
      const q = query<void, string>({ executor: tanstackExecutor(() => client) });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect((readStore(app, q.error) as Error).message).toMatch(/handler.*is required/);
    });
  });
});
