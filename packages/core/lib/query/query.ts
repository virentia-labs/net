import { buildNet, type NetEffect } from "./internals";
import type { Executor, NetHandler, Operator } from "../shared/types";
import { trigger, type TriggerBinding } from "../trigger/trigger";

export interface QueryConfig<Raw, Params, Data, Err> {
  // Optional only when an `executor` fetches on its own (e.g. apolloExecutor); the default
  // executor requires it.
  handler?: NetHandler<Params, Data>;
  params?: (raw: Raw) => Params;
  use?: Operator<any, Data>[];
  executor?: Executor<Params, Data>;
  key?: (params: Params) => unknown;
  initialData?: Data | null;
  // Inline shortcut for a single (or several) trigger(s). Sugar over trigger().
  trigger?: TriggerBinding<Raw> | readonly TriggerBinding<Raw>[];
  name?: string;
}

export type Query<Raw, Data, Err = unknown> = NetEffect<Raw, Data, Err>;

// A query IS an effect: call it to run, read `.pending`/`.failData`/`.doneData`/`.data`,
// abort with `.abort()`. `use` operators (concurrency/retry/cache) are effect middleware.
export function query<Params, Data, Err = unknown>(
  config: Omit<QueryConfig<Params, Params, Data, Err>, "params"> & { params?: undefined },
): Query<Params, Data, Err>;
export function query<Raw, Params, Data, Err = unknown>(
  config: QueryConfig<Raw, Params, Data, Err> & { params: (raw: Raw) => Params },
): Query<Raw, Data, Err>;
export function query(config: QueryConfig<any, any, any, any>): NetEffect<any, any, any> {
  const instance = buildNet({
    handler: config.handler,
    params: config.params,
    executor: config.executor,
    use: config.use,
    keyOf: config.key,
    initialData: config.initialData ?? null,
    factory: query,
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
