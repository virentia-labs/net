import { childController } from "../shared/signal";
import type { Operator } from "../shared/types";

export interface TimeoutConfig {
  ms: number;
}

export class TimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`net: run timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

// Abort the run if it exceeds `ms`. Uses a child controller, so the handler's fetch is
// actually cancelled (not just ignored), and rejects with a TimeoutError.
export function timeout<Params, Data>(config: TimeoutConfig | number): Operator<Params, Data> {
  const ms = typeof config === "number" ? config : config.ms;

  return {
    name: "timeout",
    stage: "executor",
    wrapHandler(next) {
      return (params, ctx) => {
        const controller = childController(ctx.signal);
        const error = new TimeoutError(ms);

        // Race the run against the deadline: reject even if the handler ignores the signal.
        // We still abort the controller so a signal-aware handler actually cancels its fetch.
        return new Promise<Data>((resolve, reject) => {
          const timer = setTimeout(() => {
            controller.abort(error);
            reject(error);
          }, ms);

          next(params, { ...ctx, signal: controller.signal }).then(
            (data) => {
              clearTimeout(timer);
              resolve(data);
            },
            (cause) => {
              clearTimeout(timer);
              reject(cause);
            },
          );
        });
      };
    },
  };
}
