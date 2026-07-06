import type { Scope } from "@virentia/core";

import {
  getGlobalDefaults,
  getScopedDefaults,
  setGlobalDefaults,
  setScopedDefaults,
  type NetDefaults,
  type NetFactory,
} from "./registry";

export interface OverrideOptions {
  // Scope the override to one scope only. Omit for a process-global default.
  scope?: Scope;
}

// Override the defaults every query/mutation inherits from a factory. Without `scope`, sets
// the process-global fallback; with `scope`, sets a per-scope value (tests, SSR requests).
// Resolution happens at execution time inside the run's scope, so scoped overrides win there
// and never leak elsewhere. Returns a function that restores the previous value.
//
//   overrideDefaults(query, { executor: tanstackExecutor(() => client) });
//   overrideDefaults(query, { use: [retry({ times: 5 })] }, { scope: testScope });
export function overrideDefaults(
  factory: NetFactory,
  overrides: NetDefaults,
  options?: OverrideOptions,
): () => void {
  const scope = options?.scope;

  if (scope) {
    const previous = getScopedDefaults(scope, factory);
    setScopedDefaults(scope, factory, overrides);
    return () => setScopedDefaults(scope, factory, previous);
  }

  const previous = getGlobalDefaults(factory);
  setGlobalDefaults(factory, overrides);
  return () => setGlobalDefaults(factory, previous);
}
