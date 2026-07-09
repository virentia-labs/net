import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import {
  query,
  retry,
  SkipSignal,
  type Handler,
  type OperatorInitCtx,
  type RunCtx,
} from "../../lib/index";
import { microtask } from "../support/runtime";

describe("retry stops early", () => {
  test("never retries a SkipSignal", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new SkipSignal("cache-hit");
      },
      use: [retry({ times: 5, delay: 0 })],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(attempts).toBe(1);
  });

  describe("when the run is aborted mid-backoff", () => {
    test("stops retrying", async () => {
      let attempts = 0;
      const q = query({
        handler: async (): Promise<string> => {
          attempts += 1;
          throw new Error("x");
        },
        use: [retry({ times: 5, delay: 1000 })],
      });
      const app = scope();
      let p!: Promise<unknown>;
      scoped(app, () => {
        p = q(undefined);
      });
      await microtask(); // attempt 1 fails, now sleeping in the 1000ms backoff
      expect(attempts).toBe(1);
      scoped(app, () => q.abort()); // abort the run → delay rejects
      await p.catch(() => {});
      expect(attempts).toBe(1);
    });

    test("propagates the handler's own error, not the abort reason", () => {
      // Isolates retry's ctx.signal.aborted early-out: on an aborted run it gives up throwing the
      // handler's last error, rather than falling into the backoff delay (which would rethrow the
      // abort reason). Driven at wrapHandler level — end-to-end, delay's own abort-reject shadows it.
      const op = retry<void, string>({ times: 5, delay: 0 });
      const ctrl = new AbortController();
      ctrl.abort(new Error("abort-reason"));
      const next: Handler<void, string> = async () => {
        throw new Error("handler-error");
      };
      const wrapped = op.wrapHandler!(next, {} as OperatorInitCtx<string>);
      const ctx = { signal: ctrl.signal } as unknown as RunCtx;
      return expect(wrapped(undefined, ctx)).rejects.toThrow("handler-error");
    });
  });
});
