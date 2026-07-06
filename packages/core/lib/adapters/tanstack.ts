import type { Executor, NetHandler } from "../shared/types";

// Minimal structural shape of a TanStack `QueryClient`. A real `@tanstack/query-core`
// QueryClient satisfies it, so you pass your client without a hard dependency here.
export interface TanstackQueryClientLike {
  fetchQuery<Data>(options: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<Data>;
    staleTime?: number;
  }): Promise<Data>;
}

export interface TanstackExecutorOptions<Params> {
  // Cache key for this run. Defaults to [name ?? "net", params].
  queryKey?: (params: Params) => readonly unknown[];
  staleTime?: number;
}

// Route a query's `handler` through a TanStack QueryClient so its cache and request
// deduplication apply — without changing the net query surface. The client is read lazily
// so it can come from a per-scope dependency.
export function tanstackExecutor<Params, Data>(
  getClient: () => TanstackQueryClientLike,
  options: TanstackExecutorOptions<Params> = {},
): Executor<Params, Data> {
  return (params, ctx) => {
    const handler = ctx.handler as NetHandler<Params, Data> | undefined;

    if (!handler) {
      throw new Error("tanstackExecutor: a `handler` is required (it is the query function).");
    }

    return getClient().fetchQuery<Data>({
      queryKey: options.queryKey ? options.queryKey(params) : [ctx.name ?? "net", params],
      staleTime: options.staleTime,
      // Use net's abort signal so query.abort() / takeLatest cancel the fetch.
      queryFn: () => handler(params, { signal: ctx.signal, scope: ctx.scope }),
    });
  };
}
