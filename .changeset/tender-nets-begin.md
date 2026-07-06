---
"@virentia/net-core": minor
---

Initial core: `query` and `mutation` as Virentia effects, `trigger()` bindings, and
the `concurrency` (takeLatest/takeFirst/takeEvery/queue) and `retry` operators. Mutations
support `optimistic` updates and `invalidates`. Additional operators: `timeout`, `debounce`,
`fallback`, `tap`. Adds `overrideDefaults` (global + per-scope default executor/operators) and
TanStack Query / Apollo executor adapters via the `@virentia/net-core/tanstack` and
`@virentia/net-core/apollo` subpath exports. An executor is now a plain function
`(params, ctx) => Promise<Data>`.
