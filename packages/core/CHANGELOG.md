# @virentia/net-core

## 0.1.1

### Patch Changes

- fix: bump virentia

## 0.1.0

### Minor Changes

- fb00108: Framework bindings. `@virentia/net-react` and `@virentia/net-vue` add `useQuery`/`useMutation`
  (thin sugar over `useUnit`, returning `{ data, error, pending, stale, run/mutate, refetch,
reset }`). `@virentia/net-core` gains an `error` store on query/mutation (latest error per
  scope, cleared on success).
- fb00108: Initial core: `query` and `mutation` as Virentia effects, `trigger()` bindings, and
  the `concurrency` (takeLatest/takeFirst/takeEvery/queue) and `retry` operators. Mutations
  support `optimistic` updates and `invalidates`. Additional operators: `timeout`, `debounce`,
  `fallback`, `tap`. Adds `overrideDefaults` (global + per-scope default executor/operators) and
  TanStack Query / Apollo executor adapters via the `@virentia/net-core/tanstack` and
  `@virentia/net-core/apollo` subpath exports. An executor is now a plain function
  `(params, ctx) => Promise<Data>`.
