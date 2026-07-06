// Query & mutation — both are Virentia effects with a middleware chain.
export { query } from "./query/query";
export type { Query, QueryConfig } from "./query/query";
export { mutation } from "./mutation/mutation";
export type {
  Mutation,
  MutationConfig,
  OptimisticConfig,
  OptimisticCtx,
} from "./mutation/mutation";

// Triggers.
export { trigger } from "./trigger/trigger";
export type { TriggerBinding, Unsubscribe } from "./trigger/trigger";

// Out-of-the-box operators.
export { concurrency } from "./operators/concurrency";
export type { ConcurrencyConfig, ConcurrencyStrategy } from "./operators/concurrency";
export { retry } from "./operators/retry";
export type { RetryConfig } from "./operators/retry";
export { timeout } from "./operators/timeout";
export type { TimeoutConfig } from "./operators/timeout";
export { fallback } from "./operators/fallback";
export type { FallbackConfig } from "./operators/fallback";
export { debounce } from "./operators/debounce";
export type { DebounceConfig } from "./operators/debounce";
export { tap } from "./operators/tap";
export type { TapConfig } from "./operators/tap";

// Global + per-scope defaults.
export { overrideDefaults } from "./defaults/override";
export type { OverrideOptions } from "./defaults/override";
export type { NetDefaults, NetFactory } from "./defaults/registry";

// Extension primitives.
export { isSkip, SkipSignal } from "./shared/skip";
export type { SkipReason } from "./shared/skip";
export type {
  Executor,
  Handler,
  NetHandler,
  Operator,
  OperatorInitCtx,
  OperatorStage,
  RunCtx,
} from "./shared/types";
export { NET } from "./query/internals";
export type { NetEffect, NetInternals } from "./query/internals";
