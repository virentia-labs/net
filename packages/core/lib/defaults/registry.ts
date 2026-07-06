import type { Scope } from "@virentia/core";

import type { Executor, Operator } from "../shared/types";

// Defaults every query/mutation inherits. Resolved at execution time, inside the run's
// scope, so per-scope overrides (tests, SSR requests) stay isolated.
export interface NetDefaults {
  // Default execution engine when a query/mutation doesn't pass its own `executor`.
  executor?: Executor<any, any>;
  // Operators prepended to every query/mutation's `use` (within their stage).
  use?: Operator<any, any>[];
}

// The registry is keyed by the factory (`query` / `mutation`), so each has its own defaults.
export type NetFactory = (config: any) => any;

const EMPTY: NetDefaults = {};

const globalDefaults = new Map<NetFactory, NetDefaults>();
const scopedDefaults = new WeakMap<Scope, Map<NetFactory, NetDefaults>>();

export function setGlobalDefaults(factory: NetFactory, value: NetDefaults | undefined): void {
  if (value) {
    globalDefaults.set(factory, value);
  } else {
    globalDefaults.delete(factory);
  }
}

export function getGlobalDefaults(factory: NetFactory): NetDefaults | undefined {
  return globalDefaults.get(factory);
}

export function setScopedDefaults(
  scope: Scope,
  factory: NetFactory,
  value: NetDefaults | undefined,
): void {
  let map = scopedDefaults.get(scope);

  if (!map) {
    if (!value) return;
    map = new Map();
    scopedDefaults.set(scope, map);
  }

  if (value) {
    map.set(factory, value);
  } else {
    map.delete(factory);
  }
}

export function getScopedDefaults(scope: Scope, factory: NetFactory): NetDefaults | undefined {
  return scopedDefaults.get(scope)?.get(factory);
}

// Merge precedence: built-in < global < scoped. `executor` is last-wins; `use` accumulates
// (global defaults first, then scoped, then the instance's own `use`).
export function resolveDefaults(factory: NetFactory | undefined, scope: Scope | null): NetDefaults {
  if (!factory) return EMPTY;

  const global = globalDefaults.get(factory);
  const scoped = scope ? scopedDefaults.get(scope)?.get(factory) : undefined;

  if (!global && !scoped) return EMPTY;

  return {
    executor: scoped?.executor ?? global?.executor,
    use: [...(global?.use ?? []), ...(scoped?.use ?? [])],
  };
}
