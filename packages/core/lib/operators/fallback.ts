import { isAbortReason } from "../shared/signal";
import { isSkip } from "../shared/skip";
import type { Operator } from "../shared/types";

export type FallbackConfig<Params, Data> = Data | ((error: unknown, params: Params) => Data);

// Recover from a failed run by resolving with a fallback value instead of failing. Skips and
// aborts pass through untouched. Place it before `retry` in `use` so it catches only after
// retries are exhausted.
export function fallback<Params, Data>(
  value: FallbackConfig<Params, Data>,
): Operator<Params, Data> {
  return {
    name: "fallback",
    stage: "executor",
    wrapHandler(next) {
      return async (params, ctx) => {
        try {
          return await next(params, ctx);
        } catch (error) {
          // Cancellations are not failures to recover from — pass them through untouched. This
          // mirrors the error store's classification (isSkip + isAbortReason) so a cancellation
          // is treated the same everywhere, whether or not net's own signal is the aborter.
          if (isSkip(error) || ctx.signal.aborted || isAbortReason(error)) {
            throw error;
          }

          return typeof value === "function"
            ? (value as (error: unknown, params: Params) => Data)(error, params)
            : value;
        }
      };
    },
  };
}
