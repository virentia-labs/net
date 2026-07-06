import {
  effect,
  event,
  reaction,
  store,
  type EffectHandlerContext,
  type Effect,
  type EventCallable,
  type Store,
  type StoreWritable,
} from "@virentia/core";

import { resolveDefaults, type NetFactory } from "../defaults/registry";
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
  const lastParams = store<Raw | undefined>(undefined);

  const mapParams = config.params ?? ((raw: Raw) => raw as unknown as Params);

  const chain: Operator<any, Data>[] = [...(config.defaultUse ?? []), ...(config.use ?? [])];
  sortByStage(chain);

  const dispatch = (raw: Raw, ectx: EffectHandlerContext): Promise<Data> => {
    const params = mapParams(raw);

    // Defaults are resolved here, inside the run's scope, so overrideDefaults({ scope })
    // applies per scope and executor/use swaps happen without changing the surface.
    const defaults = resolveDefaults(config.factory, ectx.scope);
    const executor: Executor<Params, Data> = config.executor ?? defaults.executor ?? defaultExecutor;

    const effectiveChain =
      defaults.use && defaults.use.length > 0 ? mergeChain(defaults.use, chain) : chain;

    const runCtx: RunCtx = {
      signal: ectx.signal,
      scope: ectx.scope,
      key: config.keyOf ? config.keyOf(params) : undefined,
      name,
      handler: config.handler,
    };

    return compose(effectiveChain, executor, initCtx)(params, runCtx);
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
  reaction({ on: fx.failData, run: (reason) => void (error.value = reason as Err) });
  reaction({ on: fx.started, run: (params) => void (lastParams.value = params) });

  const refresh = event<void>(name ? `${name}.refresh` : undefined);
  reaction({
    on: refresh,
    run: () => {
      const last = lastParams.value;

      if (last !== undefined) {
        // Fire-and-forget; a skipped/superseded run rejects but surfaces on failData.
        fx(last).catch(() => {});
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
      void fx.abort();
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
