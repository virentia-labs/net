import type { Scope, StoreWritable } from "@virentia/core";
import { describe, expectTypeOf, test } from "vitest";

import {
  concurrency,
  debounce,
  fallback,
  retry,
  tap,
  timeout,
  type ConcurrencyStrategy,
  type Executor,
  type Handler,
  type NetHandler,
  type Operator,
  type OperatorInitCtx,
  type OperatorStage,
  type RunCtx,
} from "../../lib/index";

describe("operator types", () => {
  test("each factory returns Operator<Params, Data>", () => {
    expectTypeOf(concurrency<string, number>()).toEqualTypeOf<Operator<string, number>>();
    expectTypeOf(retry<string, number>()).toEqualTypeOf<Operator<string, number>>();
    expectTypeOf(timeout<string, number>(10)).toEqualTypeOf<Operator<string, number>>();
    expectTypeOf(fallback<string, number>(0)).toEqualTypeOf<Operator<string, number>>();
    expectTypeOf(debounce<string, number>(10)).toEqualTypeOf<Operator<string, number>>();
    expectTypeOf(tap<string, number>({})).toEqualTypeOf<Operator<string, number>>();
  });

  test("pins the documented ConcurrencyStrategy and OperatorStage unions", () => {
    expectTypeOf<ConcurrencyStrategy>().toEqualTypeOf<
      "takeLatest" | "takeFirst" | "takeEvery" | "queue"
    >();
    expectTypeOf<OperatorStage>().toEqualTypeOf<"scheduler" | "executor">();
  });

  test("pins the documented RunCtx and OperatorInitCtx shapes", () => {
    expectTypeOf<RunCtx>().toMatchTypeOf<{
      signal: AbortSignal;
      scope: Scope;
      key: unknown;
      name?: string;
    }>();
    expectTypeOf<RunCtx["handler"]>().toEqualTypeOf<NetHandler<any, any> | undefined>();
    expectTypeOf<RunCtx["key"]>().toEqualTypeOf<unknown>();
    expectTypeOf<OperatorInitCtx<number>["data"]>().toEqualTypeOf<StoreWritable<number | null>>();
    expectTypeOf<OperatorInitCtx<number>["stale"]>().toEqualTypeOf<StoreWritable<boolean>>();
  });

  test("equates Executor with Handler", () => {
    expectTypeOf<Executor<string, number>>().toEqualTypeOf<Handler<string, number>>();
    expectTypeOf<NetHandler<string, number>>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<NetHandler<string, number>>().returns.toEqualTypeOf<Promise<number>>();
  });
});
