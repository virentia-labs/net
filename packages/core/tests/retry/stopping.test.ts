import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, retry, SkipSignal } from "../../lib/index";
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
  });
});
