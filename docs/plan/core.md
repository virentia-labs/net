# `@virentia/net-core` — design & implementation plan

Status: **draft for review**. Scope: the **core** package only (`react`/`vue`
bindings get their own plans later).

`net` is a declarative remote-data layer for Virentia — the "farfetched" of this stack.
A query is defined once, outside the UI, as a model; where and when it runs (triggers),
whether it may run (barriers), how overlapping runs behave (concurrency), and how results
are reused (cache) are all separate, composable concerns.

---

## 0. Foundational decision: net is built **on** `@virentia/core`

Everything in the examples — `route.opened` (event), `route.params.id` (reactive read),
per-scope values, `AbortSignal` in the handler — is Virentia. `net-core` does **not**
reimplement reactivity; it composes core primitives:

- `effect` → the query's execution unit (gives us `pending`, `inFlight`, `abort`, `signal`, per-scope isolation).
- `store` → `data` / `error` / `status` / `stale`.
- `event` → `start` / `refresh` / `reset` / `finished.*`.
- `reaction` → wiring triggers, operators, barriers.
- `scope` → per-run isolation (app, test, SSR request).
- `dependency` + `provideDependency` → the mechanism behind `overrideDefaults` (per-scope).
- `owner` → cleanup of trigger/operator reactions for runtime-created queries.

**Package change required (step 0):** add `@virentia/core` to `packages/core/package.json`.
Recommended: `peerDependencies: { "@virentia/core": ">=0.4" }` **and** a matching
`devDependencies` entry, so a consumer dedupes a single core instance (identity of
`store`/`event` nodes matters). Tests alias `@virentia/net-core` and `@virentia/core` to
their workspace `lib` sources (mirror the existing vitest alias setup).

> Open question O1 (confirm): peer-dep on `@virentia/core` as above — agreed?

---

## 0.1. Core principle: a query/mutation **is an effect**

Not a farfetched-style object with a pile of events. `query`/`mutation` return a
Virentia **`Effect`** (callable; carries `started`/`done`/`doneData`/`failed`/`failData`/
`finally`/`settled`/`pending`/`inFlight`/`abort`/`aborted`), augmented with **at most a couple
of stores** where genuinely useful (`data`, `stale`). No `start`/`finished.*`/`status`
reinvention — you already get all of that from the effect.

Consequences:
- **Trigger** = call the effect: `reaction({ on, run: p => query(map(p)) })`.
- **Retry / result-taking strategy (concurrency) / abort / cache / barrier** are **operators**
  that wrap the effect's handler and/or its lifecycle — reusable across query *and* mutation.
- **State** you read from the effect: loading = `query.pending`, error = `query.failData`,
  latest value = `query.data` (a store we maintain from `doneData`). Abort = `query.abort()`
  or the per-call `signal`.

The whole `use: []` system below is therefore "effect middleware", nothing more.

## 1. Public API surface

### 1.1 `query`

```ts
function query<RawParams, Params, Data, Err = unknown>(config: {
  // Maps the trigger/`start` input into handler params. Optional:
  // when omitted, RawParams == Params (handler receives the raw input).
  params?: (raw: RawParams) => Params;

  handler: (params: Params, ctx: QueryHandlerContext) => Promise<Data>;

  initialData?: Data;

  // Ordered middleware; order is meaningful (see §2).
  use?: QueryOperator<Params, Data, Err>[];

  // Swaps the execution engine WITHOUT changing the surface (see §5).
  // Default: runs config.handler directly.
  executor?: Executor<Params, Data>;

  // Inline shortcut for a single trigger (sugar over `trigger()`, §1.2).
  trigger?: TriggerBinding<RawParams, Params>;

  name?: string; // devtools / cache-key namespacing
}): Query<RawParams, Data, Err>;

interface QueryHandlerContext {
  signal: AbortSignal;
  scope: Scope;
}
```

**The returned `Query` is an `Effect` plus two stores:**

```ts
type Query<Params, Data, Err = unknown> = Effect<Params, Data, Err> & {
  data: Store<Data | null>;   // latest successful result, per scope (fed from doneData)
  stale: Store<boolean>;      // set by cache(); false when no cache operator is used
  refresh: EventCallable<void>; // re-run with the last params seen in this scope
  reset: EventCallable<void>;   // clear data, abort in-flight
};
```

Everything else is the effect's own surface: call it to run (`query(params)`), `query.pending`
(loading), `query.failData` (error stream), `query.doneData` (results), `query.abort()`,
per-call `signal`. **Skips** (cache-hit / barrier-closed / takeFirst-dedup) surface as the
effect's `aborted` with a typed reason (`SkipReason`), not a bespoke event —
`SkipReason = "cache-hit" | "barrier" | "concurrency"`.

**Type inference note.** `params` present ⇒ the effect (and triggers) speak `RawParams` while
the handler speaks `Params`. `params` absent ⇒ both are `Params`. Two overloads keep both
ergonomic.

### 1.2 `trigger` — external, composable binding

```ts
interface TriggerBinding<RawParams, Params = RawParams> {
  on: Event<any> | Effect<any, any> | Store<any> | Array<...>; // any Virentia unit
  params?: (payload: unknown) => RawParams; // omit for void-param queries
  filter?: (payload: unknown) => boolean;   // optional guard
}

function trigger<R, P>(query: Query<R, any, any>, binding: TriggerBinding<R, P>): Unsubscribe;
```

Wires `reaction({ on: binding.on, run: (payload) => { if (filter) …; query.start(map(payload)); } })`.
The inline `config.trigger` is exactly this, applied at creation. Many triggers per query
are allowed and independent. Returns an unsubscribe; also auto-registers on the ambient
`owner` when created inside one.

`params` in the example (`() => ({ id: route.params.id })`) is a **zero-arg reactive read**,
which is supported: the mapper may ignore its payload and read reactive stores directly.

### 1.3 Barriers

```ts
function createBarrier(config: {
  // Barrier is "open" (queries may pass) when this is true.
  active: Store<boolean> | (() => boolean);
  // Optional side-effect that OPENS a closed barrier (e.g. refresh auth token).
  // While it runs, waiters queue; when it succeeds the barrier opens and releases them.
  fill?: Effect<void, any, any>;
  perform?: "once-per-close" | "always"; // dedupe concurrent fills (default: once-per-close)
}): Barrier;

interface Barrier {
  isOpen: Store<boolean>;
  open: EventCallable<void>;
  close: EventCallable<void>;
  opened: Event<void>;   // fires when it transitions closed → open (use to re-trigger queries)
  closed: Event<void>;
  /** @internal */ pass(ctx: { scope: Scope }): "open" | "closed";
}

function applyBarrier(query: Query<any, any, any>, config: { barrier: Barrier | Barrier[] }): Unsubscribe;
```

**Protocol (decided: skip, not re-queue).** `applyBarrier` inserts a **scheduler-stage
gate** (§2): before a run reaches the executor, each barrier is checked. If `isOpen`, the run
proceeds immediately. If closed, the run is **skipped now** (`finished.skip{reason:"barrier"}`)
and the barrier optionally fires its `fill` effect (e.g. refresh the auth token). The blocked
run is **not** re-queued — once `fill` opens the barrier, the app re-fires via its normal
triggers (a route re-open, a `refresh`, the next user action). This keeps the scheduler
stateless and avoids surprise re-execution of a stale intent. Barriers are per-scope (auth
state lives in a scope), so the check and `fill` run in the query's scope.

> Consequence to document loudly for users: a `start` during a closed barrier does **not**
> auto-resume. Patterns that need "resume after auth" should trigger the query on the signal
> that the barrier opened (e.g. `trigger(q, { on: authBarrier.opened })`), which we expose.

`pass()` is retained on the internal `Barrier` interface but resolves synchronously to
`"open" | "closed"`; there is no awaiting/queuing path in the scheduler.

### 1.4 Adapters (`@tanstack/query-core`, `@apollo/client`) — same surface, swapped engine

The adapters implement `Executor` (§5). They provide fetching + their **native** cache while
`net` keeps ownership of triggers, barriers, `data/error/status`, and the `use` operators
that make sense on top (concurrency/barrier still apply; `net`'s own `cache()` is omitted
when the engine already caches). Nothing in the query's public surface changes.

```ts
import { tanstackExecutor } from "@virentia/net-core/tanstack"; // secondary entry
query({ handler, executor: tanstackExecutor(() => queryClient), use: [concurrency(...)] });

import { apolloExecutor } from "@virentia/net-core/apollo";
query({ handler, executor: apolloExecutor(() => apolloClient) });
```

`queryClient`/`apolloClient` are read lazily so they can come from a `dependency`
(per-scope client in tests). Published as secondary export entry points to keep
`@tanstack/query-core` and `@apollo/client` as **optional** peer deps.

> **Decided (O2):** adapters ship as **subpath exports** of `net-core` (`net-core/tanstack`,
> `net-core/apollo`), with `@tanstack/query-core` and `@apollo/client` as **optional** peer
> deps (`peerDependenciesMeta: { optional: true }`). Promote to separate packages only if
> peer-dep pressure demands it later.

### 1.5 `mutation` — the write side (decided: in scope for this pass)

A mutation shares the query pipeline (params → scheduler → executor → settle) and its
operator seams, but differs in defaults and surface:

```ts
function mutation<RawParams, Params, Data, Err = unknown>(config: {
  params?: (raw: RawParams) => Params;
  handler: (params: Params, ctx: QueryHandlerContext) => Promise<Data>;
  use?: QueryOperator<Params, Data, Err>[];   // same operators; cache() is a no-op/omitted
  executor?: Executor<Params, Data>;
  optimistic?: {                                // optional optimistic update
    update(params: Params, ctx: OptimisticCtx): void;
    rollback(params: Params, ctx: OptimisticCtx): void; // on failure
  };
  invalidates?: Query<any, any, any> | Query<any, any, any>[]; // refresh these on success
  name?: string;
}): Mutation<RawParams, Data, Err>;

type Mutation<Params, Data, Err = unknown> = Effect<Params, Data, Err> & {
  data: Store<Data | null>;   // last result (no stale — writes aren't cached)
  reset: EventCallable<void>;
};
```

A mutation is the same effect-with-chain; `mutate` is just an alias for calling it.
Differences from `Query`:
- No `stale` / no default `cache()` (writes aren't cached); a `cache()` in `use` is ignored
  with a dev warning.
- Default concurrency is `takeEvery` (each submit is its own call), not `takeLatest`.
- Adds `mutate` (alias of `start`) and, on success, fires `invalidates` targets' `refresh`.
- `optimistic.update` writes target query stores immediately; `rollback` reverts on failure.
  Implemented as an operator over the same seams — no separate pipeline.

`mutation` reuses `QueryInternals` and the §2 pipeline verbatim; only its **default set**
(§1.6) and the extra `optimistic`/`invalidates` wiring differ. `overrideDefaults(mutation, …)`
is supported (the registry is keyed by factory).

### 1.6 `overrideDefaults` — global + per-scope defaults

```ts
interface NetDefaults {
  executor?: Executor<any, any>;
  use?: QueryOperator<any, any, any>[]; // prepended to every query's `use`
  cache?: CacheAdapter;                 // default adapter for cache()
  retry?: Partial<RetryConfig>;
  concurrency?: Partial<ConcurrencyConfig>;
}

function overrideDefaults(
  factory: typeof query,
  overrides: NetDefaults,
  options?: { scope?: Scope }, // omitted → process-global fallback
): () => void;                 // revert function
```

Resolution precedence and the value shape (`NetDefaults`) are shared by `query` and
`mutation`; the registry is keyed by the factory so each has its own defaults.

**Mechanism (this is why it can be scoped).** `net-core` defines an internal
`dependency<NetDefaults>()`. Every query resolves its effective defaults **at execution
time, inside its scope**, by: `scope dep (if provided) → global registry → built-ins`.
`overrideDefaults(query, o)` with no scope mutates the global registry;
`overrideDefaults(query, o, { scope })` calls `provideDependency(scope, defaultsDep, merged)`.
Because resolution happens at run time in-scope, per-scope overrides "just work" and SSR/test
scopes stay isolated. Passing `query` as the first arg keys the registry, leaving room
for `overrideDefaults(mutation, …)` later.

---

## 2. Internal architecture — effect + middleware chain

The query is one `effect` whose handler is a **dispatcher** over a mutable, ordered chain of
operators. Because the chain is mutable and read per call, operators can be added **after**
creation (`applyBarrier`, late `trigger`s), while inline `use` operators are there from the
start.

```
query(rawParams)                         // = calling the effect
  → params mapper                        (config.params)
  → effect call (own AbortSignal, scope) // per-call isolation from @virentia/core
  → dispatch: compose(chain)(baseHandler)(params, ctx)
        scheduler-stage ops (outer):  concurrency (takeLatest/…), barrier
        executor-stage ops (inner):   cache, retry
        baseHandler:                  executor.run → config.handler | tanstack | apollo
  → effect settles → doneData/failData/aborted  → reaction feeds data / stale
```

Operator shape (any subset of seams):

```ts
interface Operator<P, D> {
  name: string;
  stage?: "scheduler" | "executor";       // ordering bucket; default "executor"
  wrapHandler?(next: Handler<P, D>, ctx: OperatorInitCtx<P, D>): Handler<P, D>;
  setup?(ctx: OperatorInitCtx<P, D>): void; // one-time: reactions, owner cleanup, per-scope state
}
type Handler<P, D> = (params: P, ctx: RunCtx) => Promise<D>;
interface RunCtx { signal: AbortSignal; scope: Scope; key?: unknown; name?: string }
interface OperatorInitCtx<P, D> { effect: Effect<P, D>; data: StoreWritable<D | null>;
                                  stale: StoreWritable<boolean>; defaults(): NetDefaults }
```

- **Composition order.** Chain is sorted stable by stage (`scheduler` outer → `executor`
  inner), array order within a stage. `wrapHandler` is folded right-to-left so the first
  operator in a stage is the outermost. `use: [concurrency, retry, cache]` ⇒
  `concurrency( retry( cache( baseHandler ) ) )`.
- **Skips** are thrown as a `SkipSignal(reason)` from `wrapHandler`; the dispatcher maps it to
  the effect's abort path (surfaces on `aborted`, not `failed`).
- **Per-scope operator state** (takeLatest's "previous controller", cache lanes) lives in a
  `WeakMap<Scope, …>` inside the operator — never module-global mutable app state.

`QueryInternals` (held in a private symbol on the returned effect) exposes the chain +
`addOperator(op)` + the writable `data`/`stale` + `defaults()`. `trigger`, `applyBarrier`,
`mutation`'s optimistic/invalidate wiring build on it; it is not in the public type.

---

## 3. The three built-in operators

### `concurrency({ strategy, key? })` — scheduler stage
The "result-taking strategy". Implemented as a `wrapHandler` that keeps, per
`WeakMap<Scope, Map<key, InFlight>>`, the current run and its own `AbortController` (linked to
the effect's per-call `signal`):
- `takeLatest` (default): on entry, abort the previous run for this key, become current.
- `takeFirst`: if a run is in flight for this key, **return its promise** (dedup) — the new
  call shares the result, no second fetch.
- `takeEvery`: no coordination; every call runs independently.
- `queue`: await the previous run for this key to settle, then run.
- optional `key(params)` → independent lanes (per-id concurrency); default: single lane.
No reliance on `effect.abort` (which aborts *all* calls) — abort is per-run via the owned
controller, so a newer `takeLatest` cancels only the older run. `abort` remains available on
the effect for "cancel everything".

### `retry({ times, delay, when? })` — executor stage
Wraps `next`: on throw, if `when(error, attempt)` and `attempt < times`, wait `delay`
(number ms or `(attempt) => ms` for backoff), honor `signal`, retry. Emits internal
retry facts for devtools. Does not touch `status` between attempts (still `pending`).

### `cache({ key, staleAfter?, adapter? })` — executor stage (+ setup)
- `key(params) → CacheKey` (string or `unknown[]`, normalized/stable-stringified).
- On run: read adapter. Fresh hit → resolve from cache, `skip:"cache-hit"` for the fetch,
  populate `data`. Stale hit → stale-while-revalidate: serve immediately, mark `stale`,
  fetch in background.
- On `finished.success`: write `{ value, storedAt }`.
- `staleAfter`: `Duration` (`number` ms | `"5m"`/`"30s"`/`"1h"` string, parsed by `shared/time`).
- `adapter` defaults to an in-memory LRU; resolved from defaults (§1.6) if omitted.

```ts
interface CacheAdapter {
  get(key: string, ctx: { scope: Scope }): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ctx: { scope: Scope }): Promise<void>;
  delete(key: string, ctx: { scope: Scope }): Promise<void>;
}
interface CacheEntry { value: unknown; storedAt: number; }
```
Adapter is async-first so localStorage/IndexedDB/redis adapters drop in unchanged.

---

## 4. Proposed file layout (`packages/core/lib`)

```
index.ts                 // public exports
query/create-query.ts    // assembles internals + pipeline + operators + inline trigger
query/internals.ts       // builds effect/stores/events skeleton, settle, runNow
query/pipeline.ts        // compose scheduler + executor middleware
query/types.ts
trigger/trigger.ts
barrier/create-barrier.ts, barrier/apply-barrier.ts, barrier/types.ts
operators/concurrency.ts, operators/retry.ts
operators/cache/cache.ts, operators/cache/in-memory.ts, operators/cache/types.ts
operators/types.ts       // QueryOperator, middleware types
executor/types.ts        // Executor / ExecutorContext
executor/handler.ts      // default handler executor
adapters/tanstack.ts     // secondary entry: net-core/tanstack
adapters/apollo.ts       // secondary entry: net-core/apollo
defaults/override.ts, defaults/registry.ts, defaults/dependency.ts
shared/time.ts           // Duration parsing
shared/keys.ts           // cache-key normalization
```

`tsdown.config.ts` gains entries for `lib/index.ts`, `lib/adapters/tanstack.ts`,
`lib/adapters/apollo.ts`; `package.json#exports` gains `./tanstack` and `./apollo`
(mirror how virentia core exposes `./devtools`); `tsconfig.json#paths` + the include globs
gain the new files.

---

## 5. Executor / adapter contract (§1.4 detail)

```ts
interface Executor<Params, Data> {
  run(params: Params, ctx: ExecutorContext<Params, Data>): Promise<Data>;
}
interface ExecutorContext<Params, Data> {
  signal: AbortSignal;
  scope: Scope;
  handler: (params: Params, ctx: QueryHandlerContext) => Promise<Data>; // the config.handler
  queryName?: string;
}
```
- **default**: `run = (p, ctx) => ctx.handler(p, ctx)`.
- **tanstack**: `queryClient.fetchQuery({ queryKey, queryFn: () => ctx.handler(p, ctx), signal })`.
  Concurrency/cache can be delegated to tanstack or kept in net — the surface is identical.
- **apollo**: `client.query({ query: gql, variables: p })` (handler builds document/vars, or
  the executor takes a `document` option). Signal maps to Apollo's abort where supported.

Because the executor is the innermost layer, `net`'s scheduler operators (concurrency,
barrier) and `retry` still wrap it; only `net`'s own `cache()` is dropped when the engine
caches natively.

---

## 6. Testing strategy

- Pure vitest, no DOM; drive queries through `scope()` + `allSettled(query.start, { scope, payload })`.
- Fake time for `retry.delay` / `cache.staleAfter` (vitest fake timers).
- A `dependency`-backed fake HTTP client + fake `queryClient`/`apolloClient` per scope proves
  per-scope isolation and `overrideDefaults({ scope })`.
- Coverage per feature: params mapping, each concurrency strategy, retry backoff + abort,
  cache fresh/stale/SWR, barrier open/closed/fill, trigger filter/map, adapter parity
  (same assertions run against default + tanstack + apollo executors), overrideDefaults
  global vs scoped precedence.
- Replace the placeholder `tests/smoke.test.ts` as real suites land.

---

## 7. Milestones

- **M0 — wiring** ✅: `@virentia/core` peer+dev dep; workspace green.
- **M1 — query skeleton** ✅: `query` (params/handler/executor-default) + effect-as-query
  internals + `data`/`stale` + `refresh`/`reset`. Tests.
- **M2 — triggers** ✅: `trigger()` + inline `config.trigger`, owner cleanup, filter/map.
- **M3 — operators** 🚧: `concurrency` + `retry` done; `cache` (in-memory adapter) remaining.
- **M4 — barriers**: `createBarrier` + `applyBarrier` (skip semantics, `opened`/`fill`).
- **M5 — mutations** ✅: `mutation` on the shared pipeline — `optimistic`, `invalidates`.
  _(cache() no-op guard for mutations still TODO)_
- **M6 — defaults** ✅: `overrideDefaults(query|mutation, …, { scope? })` — global + per-scope
  registry, resolved at execution time inside the run's scope.
- **M7 — adapters** ✅: `tanstackExecutor` / `apolloExecutor` as `net-core/tanstack` &
  `net-core/apollo` subpath entries (structural client shapes; `handler` optional).
- **M8 — polish**: devtools/inspector metadata, README + docs, changeset for first release.

Each milestone: `pnpm typecheck && pnpm test && pnpm build` stays green before moving on.

**Landed so far** (`packages/core/lib`): `query/` (internals, create-query), `mutation/`,
`trigger/`, `operators/` (concurrency, retry), `executor/` (types, default handler),
`shared/` (skip, delay, signal, types). 19 tests in `packages/core/tests`.
**Next:** M3 `cache()` → M4 barriers → M6 `overrideDefaults` → M7 adapters.

---

## 8. Decisions log

Resolved with the maintainer:

- **O1** — `@virentia/core` is a **peer + dev** dependency of `net-core`. _(recommended; assume unless told otherwise)_
- **O2** — adapters ship as **subpath exports** (`net-core/tanstack`, `net-core/apollo`),
  optional peer deps. _(§1.4)_
- **O3** — **`mutation` is in scope now**, on the shared pipeline. _(§1.5, M5)_
- **O4** — a barrier-blocked run is **skipped** (`finished.skip{barrier}`), not re-queued;
  apps re-trigger on `barrier.opened`. _(§1.3)_

Still open (non-blocking, decide during implementation):

- Cache-key stability for structured params (stable-stringify vs user-provided `key` only).
- Whether `queue` concurrency shares one lane globally or per `key`.
- Optimistic-update ctx shape (`OptimisticCtx`) — finalize when M5 lands.
```
