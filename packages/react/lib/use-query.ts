import { useUnit } from "@virentia/react";
import type { Query } from "@virentia/net-core";

export interface UseQueryResult<Raw, Data, Err> {
  data: Data | null;
  error: Err | null;
  pending: boolean;
  stale: boolean;
  // Run the query in the provided scope. Omit-arg form works for void-param queries.
  run: (params: Raw) => Promise<Data>;
  refetch: () => Promise<void>;
  reset: () => Promise<void>;
}

// Read a query's state and get scope-bound callbacks. A query is a Virentia effect, so this
// is thin sugar over `useUnit` — it reads the per-scope `data`/`error`/`pending`/`stale`
// stores and binds `run`/`refetch`/`reset` to the provided scope.
export function useQuery<Raw, Data, Err>(
  query: Query<Raw, Data, Err>,
): UseQueryResult<Raw, Data, Err> {
  return useUnit({
    data: query.data,
    error: query.error,
    pending: query.pending,
    stale: query.stale,
    run: query,
    refetch: query.refresh,
    reset: query.reset,
  }) as UseQueryResult<Raw, Data, Err>;
}
