import type { Scope } from "@virentia/core";
import { describe, expectTypeOf, test } from "vitest";

import {
  isSkip,
  NET,
  overrideDefaults,
  query,
  retry,
  SkipSignal,
  trigger,
  type Executor,
  type Operator,
  type Unsubscribe,
} from "../../lib/index";
import { apolloExecutor, type ApolloClientLike } from "../../lib/adapters/apollo";
import { tanstackExecutor, type TanstackQueryClientLike } from "../../lib/adapters/tanstack";

describe("overrideDefaults types", () => {
  test("returns a revert thunk", () => {
    const revert = overrideDefaults(query, { use: [retry()] });
    expectTypeOf(revert).toEqualTypeOf<() => void>();
    const scoped = overrideDefaults(query, {}, { scope: {} as Scope });
    expectTypeOf(scoped).toEqualTypeOf<() => void>();
  });
});

describe("trigger types", () => {
  test("returns an Unsubscribe", () => {
    const q = query({ handler: async (id: string) => id });
    const stop = trigger(q, { on: q.doneData });
    expectTypeOf(stop).toEqualTypeOf<Unsubscribe>();
    expectTypeOf<Unsubscribe>().toEqualTypeOf<() => void>();
  });
});

describe("adapter types", () => {
  test("adapter executors are Executor<Params, Data>", () => {
    const t = tanstackExecutor<string, number>(() => ({}) as TanstackQueryClientLike);
    expectTypeOf(t).toEqualTypeOf<Executor<string, number>>();
    const a = apolloExecutor<string, number>(() => ({}) as ApolloClientLike, { document: {} });
    expectTypeOf(a).toEqualTypeOf<Executor<string, number>>();
  });
});

describe("skip types", () => {
  test("isSkip narrows unknown to SkipSignal", () => {
    const value: unknown = new SkipSignal("barrier");
    if (isSkip(value)) {
      expectTypeOf(value).toEqualTypeOf<SkipSignal>();
    }
  });
});

describe("NET types", () => {
  test("keys the internals mapParams and addOperator", () => {
    const q = query({ handler: async (id: string) => id });
    expectTypeOf(q[NET].mapParams).toMatchTypeOf<(raw: string) => unknown>();
    expectTypeOf(q[NET].addOperator).toEqualTypeOf<(op: Operator<any, string>) => void>();
  });
});
