import { reaction, scoped, type Scope } from "@virentia/core";

import { buildNet, type NetEffect } from "../query/internals";
import type { Executor, Handler, NetHandler, Operator } from "../shared/types";
import { trigger, type TriggerBinding } from "../trigger/trigger";

export interface OptimisticCtx {
  scope: Scope;
}

export interface OptimisticConfig<Params> {
  update(params: Params, ctx: OptimisticCtx): void;
  rollback(params: Params, ctx: OptimisticCtx): void; // reverted once, after the final failure
}

export interface MutationConfig<Raw, Params, Data, Err> {
  handler?: NetHandler<Params, Data>;
  params?: (raw: Raw) => Params;
  use?: Operator<any, Data>[];
  executor?: Executor<Params, Data>;
  key?: (params: Params) => unknown;
  // Refresh these queries on success (re-runs them with their last params per scope).
  invalidates?: NetEffect<any, any, any> | readonly NetEffect<any, any, any>[];
  optimistic?: OptimisticConfig<Params>;
  trigger?: TriggerBinding<Raw> | readonly TriggerBinding<Raw>[];
  name?: string;
}

export type Mutation<Raw, Data, Err = unknown> = NetEffect<Raw, Data, Err>;

// A mutation is the same effect-with-chain as a query; the write-side extras
// (optimistic, invalidates) are just operators over the shared pipeline.
export function mutation<Params, Data, Err = unknown>(
  config: Omit<MutationConfig<Params, Params, Data, Err>, "params"> & { params?: undefined },
): Mutation<Params, Data, Err>;
export function mutation<Raw, Params, Data, Err = unknown>(
  config: MutationConfig<Raw, Params, Data, Err> & { params: (raw: Raw) => Params },
): Mutation<Raw, Data, Err>;
export function mutation(
  config: MutationConfig<any, any, any, any>,
): NetEffect<any, any, any> {
  const use: Operator<any, any>[] = [...((config.use ?? []) as Operator<any, any>[])];

  if (config.optimistic) {
    use.push(optimisticOperator(config.optimistic));
  }

  if (config.invalidates) {
    const targets = Array.isArray(config.invalidates)
      ? config.invalidates
      : [config.invalidates];
    use.push(invalidateOperator(targets));
  }

  const instance = buildNet({
    handler: config.handler,
    params: config.params,
    executor: config.executor,
    use,
    keyOf: config.key,
    factory: mutation,
    name: config.name,
  });

  if (config.trigger) {
    const bindings = Array.isArray(config.trigger) ? config.trigger : [config.trigger];

    for (const binding of bindings) {
      trigger(instance, binding);
    }
  }

  return instance;
}

// Applies the optimistic update once (outside retry, hence the scheduler stage), reverting
// after the final failure.
function optimisticOperator<Params, Data>(
  optimistic: OptimisticConfig<Params>,
): Operator<Params, Data> {
  return {
    name: "optimistic",
    stage: "scheduler",
    wrapHandler(next: Handler<Params, Data>): Handler<Params, Data> {
      return async (params, ctx) => {
        scoped(ctx.scope, () => optimistic.update(params, { scope: ctx.scope }));

        try {
          return await next(params, ctx);
        } catch (error) {
          scoped(ctx.scope, () => optimistic.rollback(params, { scope: ctx.scope }));
          throw error;
        }
      };
    },
  };
}

function invalidateOperator<Params, Data>(
  targets: readonly NetEffect<any, any, any>[],
): Operator<Params, Data> {
  return {
    name: "invalidate",
    setup({ effect }) {
      reaction({
        on: effect.doneData,
        run: () => {
          for (const target of targets) {
            void target.refresh();
          }
        },
      });
    },
  };
}
