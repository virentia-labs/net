import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, retry } from "../../lib/index";

describe("retry backoff", () => {
  describe("with a delay function", () => {
    test("receives each 1-based attempt and thrown error", async () => {
      const calls: Array<{ attempt: number; msg: string }> = [];
      let attempts = 0;
      const q = query({
        handler: async (): Promise<string> => {
          attempts += 1;
          throw new Error(`e${attempts}`);
        },
        use: [
          retry({
            times: 3,
            delay: (attempt, error) => {
              calls.push({ attempt, msg: (error as Error).message });
              return 0;
            },
          }),
        ],
      });
      await scoped(scope(), () => q(undefined)).catch(() => {});
      expect(calls).toEqual([
        { attempt: 1, msg: "e1" },
        { attempt: 2, msg: "e2" },
        { attempt: 3, msg: "e3" },
      ]);
      expect(attempts).toBe(4); // 1 + 3 retries; no delay computed for the final give-up
    });
  });

  test("waits the configured delay between attempts", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("x");
        return "ok";
      },
      use: [retry({ times: 3, delay: 30 })], // positive real delay
    });
    const start = performance.now();
    await scoped(scope(), () => q(undefined));
    const elapsed = performance.now() - start;
    expect(attempts).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(25); // the backoff timer genuinely fired
  });
});
