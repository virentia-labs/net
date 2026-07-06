# @virentia/net-core

Declarative remote-data layer for [Virentia](https://movpushmov.dev). A query/mutation **is a Virentia effect**, so you get `pending`, `done`/`doneData`,
`failed`/`failData`, `abort`, per-call `signal`, and per-scope isolation for free. Where and
when it runs (triggers), whether it may run (barriers), how overlapping runs behave
(concurrency), how failures recover (retry), and how results are reused (cache) are separate,
composable operators.

## Install

```sh
pnpm add @virentia/net-core @virentia/core
```

## Query

```ts
import { query, concurrency, retry, trigger } from "@virentia/net-core";

const userQuery = query({
  params: ({ id }: { id: string }) => ({ id }),
  handler: async ({ id }, { signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    return (await res.json()) as User;
  },
  use: [
    concurrency({ strategy: "takeLatest" }),
    retry({ times: 3, delay: 300 }),
  ],
});

// It's an effect: call it, read its units.
userQuery.pending;   // Store<boolean>
userQuery.data;     // Store<User | null> — latest success
userQuery.failData;  // Event<Error>

// Trigger it from any Virentia unit:
trigger(userQuery, {
  on: userRoute.opened,
  params: () => ({ id: userRoute.params.id }),
});
```

## Mutation

```ts
import { mutation } from "@virentia/net-core";

const renameUser = mutation({
  handler: async (name: string) => api.rename(name),
  optimistic: {
    update: (name) => { /* write your stores */ },
    rollback: (name) => { /* revert on failure */ },
  },
  invalidates: [userQuery], // re-runs it on success
});
```

## Operators (out of the box)

- `concurrency({ strategy })` — `takeLatest` (abort previous), `takeFirst` (dedup),
  `takeEvery`, `queue`; optional `key` for per-id lanes.
- `retry({ times, delay, when })` — retry on failure, abort-aware; `delay` may be a backoff fn.
- `timeout(ms)` — race a deadline, `TimeoutError` + abort the run.
- `debounce({ wait })` — pre-delay; a true debounce with `takeLatest`.
- `fallback(value | (error, params) => value)` — recover a failure instead of failing.
- `tap({ onStart, onSuccess, onError, onSettled })` — observe without changing the result.

## Adapters & defaults

Back a query with TanStack Query or Apollo without changing its surface — the adapters are
optional subpath exports:

```ts
import { tanstackExecutor } from "@virentia/net-core/tanstack";
import { apolloExecutor } from "@virentia/net-core/apollo";

query({ handler, executor: tanstackExecutor(() => queryClient) });
query({ executor: apolloExecutor(() => apolloClient, { document, variables }) }); // no handler
```

`overrideDefaults` sets a default executor/operators for every `query` (or `mutation`),
globally or scoped to one scope (resolved at run time, so tests/SSR stay isolated):

```ts
import { overrideDefaults } from "@virentia/net-core";

overrideDefaults(query, { executor: tanstackExecutor(() => queryClient) });
overrideDefaults(query, { use: [retry({ times: 5 })] }, { scope: testScope });
```

`cache(...)` and barriers are still on the roadmap — see [`docs/plan/core.md`](../../docs/plan/core.md).

## License

MIT © 2026 movpushmov
