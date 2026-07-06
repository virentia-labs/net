import { delay } from "../shared/delay";
import { isSkip } from "../shared/skip";
import type { Handler, Operator } from "../shared/types";

export interface RetryConfig {
  times?: number; // max retries after the first failure. Default: 3.
  delay?: number | ((attempt: number, error: unknown) => number); // ms between attempts. Default: 0.
  when?: (error: unknown, attempt: number) => boolean; // retry only when true. Default: always.
}

// Re-run the wrapped handler on failure, honoring the run's abort signal. Skips and aborts
// are never retried. Between attempts status stays pending (no lifecycle churn).
export function retry<Params, Data>(config: RetryConfig = {}): Operator<Params, Data> {
  const times = config.times ?? 3;
  const when = config.when ?? (() => true);
  const delayFor =
    typeof config.delay === "function" ? config.delay : () => (config.delay as number) ?? 0;

  return {
    name: "retry",
    stage: "executor",
    wrapHandler(next: Handler<Params, Data>): Handler<Params, Data> {
      return async (params, ctx) => {
        let attempt = 0;

        for (;;) {
          try {
            return await next(params, ctx);
          } catch (error) {
            attempt += 1;

            if (
              isSkip(error) ||
              ctx.signal.aborted ||
              attempt > times ||
              !when(error, attempt)
            ) {
              throw error;
            }

            await delay(delayFor(attempt, error), ctx.signal);
          }
        }
      };
    },
  };
}
