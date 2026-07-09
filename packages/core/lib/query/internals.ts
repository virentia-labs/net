import {
  effect,
  event,
  getCurrentScope,
  reaction,
  store,
  type EffectHandlerContext,
  type Effect,
  type EventCallable,
  type Scope,
  type Store,
  type StoreWritable,
} from "@virentia/core";

import { getGlobalDefaults, resolveDefaults, type NetFactory } from "../defaults/registry";
import { childController, isAbortReason, raceAbort } from "../shared/signal";
import { isSkip } from "../shared/skip";
import type {
  Executor,
  Handler,
  NetHandler,
  Operator,
  OperatorInitCtx,
  RunCtx,
} from "../shared/types";

// Default executor: call the user's handler. Errors if a query has neither a handler nor an
// executor that fetches on its own (e.g. apolloExecutor).
const defaultExecutor: Executor<any, any> = (params, ctx) => {
  if (!ctx.handler) {
    throw new Error(
      "net: no handler. Provide `handler`, or an executor that fetches on its own (e.g. apolloExecutor).",
    );
  }

  return ctx.handler(params, { signal: ctx.signal, scope: ctx.scope });
};

// Private handle carried on every net effect: the mutable operator chain plus the
// writable stores. trigger()/applyBarrier()/mutation() build on this.
export const NET = Symbol("virentia.net");

export interface NetInternals<Raw, Params, Data> {
  readonly chain: Operator<any, Data>[];
  readonly initCtx: OperatorInitCtx<Data>;
  readonly data: StoreWritable<Data | null>;
  readonly error: StoreWritable<unknown>;
  readonly stale: StoreWritable<boolean>;
  readonly mapParams: (raw: Raw) => Params;
  addOperator(op: Operator<any, Data>): void;
}

// The shape shared by Query and Mutation: a Virentia effect plus a few lean stores.
export type NetEffect<Raw, Data, Err> = Effect<Raw, Data, Err> & {
  readonly data: Store<Data | null>;
  readonly error: Store<Err | null>; // latest error (per scope); null after a success
  readonly stale: Store<boolean>;
  readonly refresh: EventCallable<void>;
  readonly reset: EventCallable<void>;
  readonly [NET]: NetInternals<Raw, unknown, Data>;
};

export interface BuildNetConfig<Raw, Params, Data, Err> {
  handler?: NetHandler<Params, Data>;
  params?: (raw: Raw) => Params;
  executor?: Executor<Params, Data>;
  use?: Operator<any, Data>[];
  defaultUse?: Operator<any, Data>[];
  keyOf?: (params: Params) => unknown;
  initialData?: Data | null;
  // Identity for the defaults registry (`query` / `mutation`), used by overrideDefaults.
  factory?: NetFactory;
  name?: string;
}

const stageRank: Record<NonNullable<Operator["stage"]>, number> = {
  scheduler: 0,
  executor: 1,
};

function sortByStage<P, D>(chain: Operator<P, D>[]): void {
  chain.sort((a, b) => stageRank[a.stage ?? "executor"] - stageRank[b.stage ?? "executor"]);
}

// Default operators (from overrideDefaults) go first within their stage, ahead of the
// instance's own `use`.
function mergeChain<D>(
  defaultsUse: Operator<any, D>[],
  chain: Operator<any, D>[],
): Operator<any, D>[] {
  const merged = [...defaultsUse, ...chain];
  sortByStage(merged);
  return merged;
}

// Fold the (already stage-sorted) chain right-to-left so the first operator in a stage
// is the outermost wrapper: use[a, b] => a(b(base)).
function compose<P, D>(
  chain: Operator<any, D>[],
  base: Handler<P, D>,
  ctx: OperatorInitCtx<D>,
): Handler<P, D> {
  let handler = base;

  for (let i = chain.length - 1; i >= 0; i--) {
    const op = chain[i];

    if (op.wrapHandler) {
      handler = op.wrapHandler(handler, ctx);
    }
  }

  return handler;
}

export function buildNet<Raw, Params, Data, Err = unknown>(
  config: BuildNetConfig<Raw, Params, Data, Err>,
): NetEffect<Raw, Data, Err> {
  const name = config.name;
  const initialData = config.initialData ?? null;

  const data = store<Data | null>(
    initialData,
    undefined,
    name ? { name: `${name}.data` } : undefined,
  );
  const error = store<Err | null>(null, undefined, name ? { name: `${name}.error` } : undefined);
  const stale = store<boolean>(false, undefined, name ? { name: `${name}.stale` } : undefined);
  // `hasRun` distinguishes "never ran" from "ran with an undefined payload" — a param-less
  // query's last params are legitimately `undefined`, so the value alone can't gate refresh.
  const hasRun = store<boolean>(false);
  const lastParams = store<Raw | undefined>(undefined);

  const mapParams = config.params ?? ((raw: Raw) => raw as unknown as Params);

  const chain: Operator<any, Data>[] = [...(config.defaultUse ?? []), ...(config.use ?? [])];
  sortByStage(chain);

  // Per-scope registry of in-flight run controllers. reset() cancels only the acting scope's
  // runs; core's fx.abort() iterates every active call regardless of scope, so net owns a
  // scope-partitioned controller layered under core's signal.
  const runControllers = new WeakMap<Scope, Set<AbortController>>();

  const registerRun = (scope: Scope, controller: AbortController): (() => void) => {
    let set = runControllers.get(scope);

    if (!set) {
      set = new Set();
      runControllers.set(scope, set);
    }

    const target = set;
    target.add(controller);

    return () => {
      target.delete(controller);
    };
  };

  const abortScopeRuns = (scope: Scope): void => {
    const set = runControllers.get(scope);

    if (!set) return;

    // Safe to iterate live: unregister() deletes via .finally() (a microtask), so nothing mutates
    // this set synchronously during the loop.
    for (const controller of set) {
      controller.abort();
    }
  };

  // Global default operators (from overrideDefaults) contribute wrapHandler per-run, but their
  // setup() must run too — once per instance — or a setup-only default (invalidation-style
  // wiring) silently no-ops. Run it lazily at first dispatch so the reaction still catches the
  // run, guarded per operator. Scoped defaults are intentionally excluded: their setup would wire
  // a scope-global reaction (core reactions aren't scope-partitioned), leaking into other scopes.
  const defaultSetupDone = new WeakSet<Operator<any, Data>>();

  const runDefaultSetup = (): void => {
    if (!config.factory) return;

    const globals = getGlobalDefaults(config.factory);

    if (!globals?.use) return;

    for (const op of globals.use as Operator<any, Data>[]) {
      if (op.setup && !defaultSetupDone.has(op)) {
        defaultSetupDone.add(op);
        op.setup(initCtx);
      }
    }
  };

  const dispatch = (raw: Raw, ectx: EffectHandlerContext): Promise<Data> => {
    const params = mapParams(raw);

    // Defaults are resolved here, inside the run's scope, so overrideDefaults({ scope })
    // applies per scope and executor/use swaps happen without changing the surface.
    const defaults = resolveDefaults(config.factory, ectx.scope);
    const executor: Executor<Params, Data> = config.executor ?? defaults.executor ?? defaultExecutor;

    const effectiveChain =
      defaults.use && defaults.use.length > 0 ? mergeChain(defaults.use, chain) : chain;

    runDefaultSetup();

    // A child of core's signal that reset() can abort per scope. raceAbort force-rejects the run
    // when it fires, mirroring core's own cancel so even a signal-ignoring handler is discarded.
    const controller = childController(ectx.signal);
    const unregister = registerRun(ectx.scope, controller);

    const runCtx: RunCtx = {
      signal: controller.signal,
      scope: ectx.scope,
      key: config.keyOf ? config.keyOf(params) : undefined,
      name,
      handler: config.handler,
    };

    const composed = Promise.resolve(compose(effectiveChain, executor, initCtx)(params, runCtx));

    return raceAbort(composed, controller.signal).finally(unregister);
  };

  const fx = effect<Raw, Data, Err>(dispatch, name);

  const initCtx: OperatorInitCtx<Data> = {
    effect: fx,
    data,
    stale,
  };

  for (const op of chain) {
    op.setup?.(initCtx);
  }

  const addOperator = (op: Operator<any, Data>): void => {
    chain.push(op);
    sortByStage(chain);
    op.setup?.(initCtx);
  };

  // Feed the lean stores from the effect's own lifecycle.
  reaction({
    on: fx.doneData,
    run: (value) => {
      data.value = value;
      error.value = null;
    },
  });
  reaction({
    on: fx.failData,
    run: (reason) => {
      // Cancellations travel the failure path but are not real errors: a superseded takeLatest
      // run rejects with a SkipSignal, and reset()/abort() reject the in-flight run with an
      // AbortError. Keep both out of the error store (a real error — including TimeoutError —
      // still lands). Callers wanting the raw signal use failData + isSkip.
      if (isSkip(reason) || isAbortReason(reason)) return;
      error.value = reason as Err;
    },
  });
  reaction({
    on: fx.started,
    run: (params) => {
      lastParams.value = params;
      hasRun.value = true;
    },
  });

  const refresh = event<void>(name ? `${name}.refresh` : undefined);
  reaction({
    on: refresh,
    run: () => {
      // Gate on hasRun, not on lastParams !== undefined: an undefined payload is a real run.
      if (hasRun.value) {
        // Fire-and-forget; a skipped/superseded run rejects but surfaces on failData.
        fx(lastParams.value as Raw).catch(() => {});
      }
    },
  });

  const reset = event<void>(name ? `${name}.reset` : undefined);
  reaction({
    on: reset,
    run: () => {
      data.value = initialData;
      error.value = null;
      stale.value = false;
      // Clear the run history so a subsequent refresh() is a no-op (nothing is loaded).
      hasRun.value = false;
      lastParams.value = undefined;
      // Cancel only this scope's in-flight runs. reset() clears per-scope stores, so its
      // cancellation is per-scope too; core's fx.abort() would cancel every scope.
      const scope = getCurrentScope();

      if (scope) {
        abortScopeRuns(scope);
      }
    },
  });

  const internals: NetInternals<Raw, Params, Data> = {
    chain,
    initCtx,
    data,
    error,
    stale,
    mapParams,
    addOperator,
  };

  return Object.assign(fx, {
    data: data as Store<Data | null>,
    error: error as Store<Err | null>,
    stale: stale as Store<boolean>,
    refresh,
    reset,
    [NET]: internals as NetInternals<Raw, unknown, Data>,
  }) as NetEffect<Raw, Data, Err>;
}
