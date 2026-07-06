import { useUnit } from "@virentia/vue";
import type { Query } from "@virentia/net-core";
import type { Ref } from "vue";

export interface UseQueryResult<Raw, Data, Err> {
  data: Readonly<Ref<Data | null>>;
  error: Readonly<Ref<Err | null>>;
  pending: Readonly<Ref<boolean>>;
  stale: Readonly<Ref<boolean>>;
  run: (params: Raw) => Promise<Data>;
  refetch: () => Promise<void>;
  reset: () => Promise<void>;
}

// Read a query's state as refs and get scope-bound callbacks. A query is a Virentia effect,
// so this is thin sugar over `useUnit` — stores come back as refs, `run`/`refetch`/`reset`
// are bound to the provided scope.
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
  }) as unknown as UseQueryResult<Raw, Data, Err>;
}
