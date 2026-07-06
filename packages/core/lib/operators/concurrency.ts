import type { Scope } from "@virentia/core";

import { childController } from "../shared/signal";
import { SkipSignal } from "../shared/skip";
import type { Handler, Operator, RunCtx } from "../shared/types";

export type ConcurrencyStrategy = "takeLatest" | "takeFirst" | "takeEvery" | "queue";

export interface ConcurrencyConfig<Params> {
  strategy?: ConcurrencyStrategy; // default: "takeLatest"
  key?: (params: Params) => unknown; // independent lanes; default: single lane
}

interface InFlight<Data> {
  promise: Promise<Data>;
  controller: AbortController;
}

const SINGLE_LANE = Symbol("net.lane");

// The "result-taking strategy". Coordinates overlapping runs per scope + lane, using its own
// abort controllers so a newer takeLatest cancels only the older run (never the whole effect).
export function concurrency<Params, Data>(
  config: ConcurrencyConfig<Params> = {},
): Operator<Params, Data> {
  const strategy = config.strategy ?? "takeLatest";
  const laneKey = config.key;

  const inflight = new WeakMap<Scope, Map<unknown, InFlight<Data>>>();
  const tails = new WeakMap<Scope, Map<unknown, Promise<unknown>>>();

  const laneOf = (params: Params, ctx: RunCtx): unknown =>
    laneKey ? laneKey(params) : (ctx.key ?? SINGLE_LANE);

  const laneMap = <V>(store: WeakMap<Scope, Map<unknown, V>>, scope: Scope): Map<unknown, V> => {
    let map = store.get(scope);

    if (!map) {
      map = new Map<unknown, V>();
      store.set(scope, map);
    }

    return map;
  };

  return {
    name: "concurrency",
    stage: "scheduler",
    wrapHandler(next: Handler<Params, Data>): Handler<Params, Data> {
      if (strategy === "takeEvery") {
        return next;
      }

      return (params, ctx) => {
        const lane = laneOf(params, ctx);

        if (strategy === "queue") {
          return runQueued(next, params, ctx, lane);
        }

        const runs = laneMap(inflight, ctx.scope);
        const current = runs.get(lane);

        if (strategy === "takeFirst" && current) {
          return current.promise; // dedup: share the in-flight result
        }

        if (strategy === "takeLatest" && current) {
          current.controller.abort(new SkipSignal("concurrency"));
        }

        const controller = childController(ctx.signal);
        const promise = Promise.resolve(next(params, { ...ctx, signal: controller.signal }));
        const entry: InFlight<Data> = { promise, controller };

        runs.set(lane, entry);

        return promise.finally(() => {
          if (runs.get(lane) === entry) {
            runs.delete(lane);
          }
        });
      };
    },
  };

  function runQueued(
    next: Handler<Params, Data>,
    params: Params,
    ctx: RunCtx,
    lane: unknown,
  ): Promise<Data> {
    const laneTails = laneMap(tails, ctx.scope);
    const prev = laneTails.get(lane) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(() => next(params, ctx));

    laneTails.set(
      lane,
      run.catch(() => {}),
    );

    return run;
  }
}
