import type { Operator } from "../shared/types";

export interface TapConfig<Params, Data> {
  onStart?(params: Params): void;
  onSuccess?(data: Data, params: Params): void;
  onError?(error: unknown, params: Params): void;
  onSettled?(params: Params): void;
}

// Observe a run without changing its result — analytics, logging, devtools. Callbacks are
// side-effects; to write stores from one, wrap the write in `scoped(ctx.scope, …)`.
export function tap<Params, Data>(config: TapConfig<Params, Data>): Operator<Params, Data> {
  return {
    name: "tap",
    stage: "scheduler",
    wrapHandler(next) {
      return async (params, ctx) => {
        config.onStart?.(params);

        try {
          const data = await next(params, ctx);
          config.onSuccess?.(data, params);
          return data;
        } catch (error) {
          config.onError?.(error, params);
          throw error;
        } finally {
          config.onSettled?.(params);
        }
      };
    },
  };
}
