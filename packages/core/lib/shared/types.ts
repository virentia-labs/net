import type { Effect, Scope, StoreWritable } from "@virentia/core";

// The user's fetcher, as supplied by config.handler.
export type NetHandler<Params, Data> = (
  params: Params,
  ctx: { signal: AbortSignal; scope: Scope },
) => Promise<Data>;

// One run of the middleware chain: mapped params + the run's isolation context.
export interface RunCtx {
  signal: AbortSignal;
  scope: Scope;
  key: unknown; // optional lane key for concurrency/cache (undefined => single lane)
  name?: string;
  // The user's handler for this run, if any — so handler-based executors (default, tanstack)
  // can reach it. Absent when the executor fetches on its own (e.g. apollo via a document).
  handler?: NetHandler<any, any>;
}

export type Handler<Params, Data> = (params: Params, ctx: RunCtx) => Promise<Data>;

// An executor is just the innermost handler of the chain: same shape, with `ctx.handler`
// available. The default calls `ctx.handler`; adapters (tanstack/apollo) replace it without
// changing the query's surface.
export type Executor<Params, Data> = Handler<Params, Data>;

export type OperatorStage = "scheduler" | "executor";

// One-time context handed to operators when they attach to a query/mutation.
export interface OperatorInitCtx<Data> {
  effect: Effect<any, Data, any>;
  data: StoreWritable<Data | null>;
  stale: StoreWritable<boolean>;
}

// An operator is effect middleware: it may wrap the handler (retry, cache, concurrency)
// and/or run one-time setup (invalidation, optimistic wiring).
export interface Operator<Params = any, Data = any> {
  name: string;
  stage?: OperatorStage; // ordering bucket; scheduler wraps outside executor. Default: "executor".
  wrapHandler?(next: Handler<Params, Data>, ctx: OperatorInitCtx<Data>): Handler<Params, Data>;
  setup?(ctx: OperatorInitCtx<Data>): void;
}
