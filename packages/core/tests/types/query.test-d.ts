import type { EventCallable, Store } from "@virentia/core";
import { describe, expectTypeOf, test } from "vitest";

import { query, type Query } from "../../lib/index";
import { apolloExecutor, type ApolloClientLike } from "../../lib/adapters/apollo";

// Type-level assertions validated by `tsc` (pnpm typecheck); this file lives outside the runtime
// glob (`*.test.ts`), so vitest never runs it — only the compiler enforces these.
interface ApiError {
  code: number;
}

describe("query types", () => {
  describe("without params", () => {
    test("infers Raw from the handler input and Data from its result", () => {
      const q = query({ handler: async (id: string) => `user:${id}` });
      expectTypeOf(q).parameter(0).toEqualTypeOf<string>();
      expectTypeOf(q).returns.toEqualTypeOf<Promise<string>>();
      expectTypeOf(q.data).toEqualTypeOf<Store<string | null>>();
      expectTypeOf(q.stale).toEqualTypeOf<Store<boolean>>();
      expectTypeOf(q.refresh).toEqualTypeOf<EventCallable<void>>();
      expectTypeOf(q.reset).toEqualTypeOf<EventCallable<void>>();
    });
  });

  describe("with params", () => {
    test("takes Raw as its argument and the mapped shape reaches the handler", () => {
      const q = query({
        params: (raw: { userId: string }) => ({ id: raw.userId }),
        handler: async (p: { id: string }) => p.id,
      });
      expectTypeOf(q).parameter(0).toEqualTypeOf<{ userId: string }>();
      expectTypeOf(q.data).toEqualTypeOf<Store<string | null>>();
      expectTypeOf(q).toEqualTypeOf<Query<{ userId: string }, string, unknown>>();
    });
  });

  test("threads an explicit Err into the error store", () => {
    const q = query<string, string, ApiError>({ handler: async (id: string) => id });
    expectTypeOf(q.error).toEqualTypeOf<Store<ApiError | null>>();
  });

  test("infers Data from an executor when the handler is omitted", () => {
    const client = {} as ApolloClientLike;
    const q = query({
      executor: apolloExecutor<{ id: string }, { name: string }>(() => client, {
        document: {},
      }),
    });
    expectTypeOf(q.data).toEqualTypeOf<Store<{ name: string } | null>>();
  });

  test("infers numeric Data from a number handler", () => {
    const q = query({ handler: async (n: number) => n * 2 });
    expectTypeOf(q).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(q.data).toEqualTypeOf<Store<number | null>>();
  });
});
