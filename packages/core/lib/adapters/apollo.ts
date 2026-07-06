import type { Executor } from "../shared/types";

// Minimal structural shape of an Apollo `ApolloClient`. A real `@apollo/client` client
// satisfies it, so you pass your client without a hard dependency here.
export interface ApolloClientLike {
  query<Data>(options: {
    query: unknown;
    variables?: Record<string, unknown>;
    fetchPolicy?: string;
    context?: Record<string, unknown>;
  }): Promise<{ data: Data }>;
}

export interface ApolloExecutorOptions<Params> {
  // A GraphQL document (from `gql`), or a function producing one per params.
  document: unknown | ((params: Params) => unknown);
  variables?: (params: Params) => Record<string, unknown>;
  fetchPolicy?: string;
}

// Back a net query with Apollo's `client.query` (document-based), so Apollo's normalized
// cache applies — without changing the net query surface. Apollo is the fetch here, so no
// `handler` is needed. The client is read lazily so it can come from a per-scope dependency.
export function apolloExecutor<Params, Data>(
  getClient: () => ApolloClientLike,
  options: ApolloExecutorOptions<Params>,
): Executor<Params, Data> {
  return async (params, ctx) => {
    const document =
      typeof options.document === "function"
        ? (options.document as (params: Params) => unknown)(params)
        : options.document;

    const { data } = await getClient().query<Data>({
      query: document,
      variables: options.variables?.(params),
      fetchPolicy: options.fetchPolicy,
      // Pass net's abort signal through Apollo's HTTP link fetchOptions.
      context: { fetchOptions: { signal: ctx.signal } },
    });

    return data;
  };
}
