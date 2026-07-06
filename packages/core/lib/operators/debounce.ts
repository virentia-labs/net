import { delay } from "../shared/delay";
import type { Operator } from "../shared/types";

export interface DebounceConfig {
  wait: number;
}

// Wait `wait` ms before running. On its own it just delays; paired with
// `concurrency({ strategy: "takeLatest" })` it becomes a true debounce — a newer run aborts
// the previous one while it is still waiting. Ideal for search-as-you-type.
//
//   use: [concurrency({ strategy: "takeLatest" }), debounce({ wait: 300 })]
export function debounce<Params, Data>(config: DebounceConfig | number): Operator<Params, Data> {
  const wait = typeof config === "number" ? config : config.wait;

  return {
    name: "debounce",
    stage: "scheduler",
    wrapHandler(next) {
      return async (params, ctx) => {
        await delay(wait, ctx.signal); // rejects if superseded/aborted during the wait
        return next(params, ctx);
      };
    },
  };
}
