import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, retry } from "../../lib/index";
import { prng } from "../support/prng";

describe("retry attempt count (property)", () => {
  test("runs min(successAttempt, times + 1) attempts, over 150 seeds", async () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = prng(seed);
      const times = rng.int(0, 5);
      const succeedAt = rng.int(1, 8); // the attempt on which the handler finally succeeds

      let attempts = 0;
      const q = query({
        handler: async () => {
          attempts += 1;
          if (attempts >= succeedAt) return "ok";
          throw new Error("x");
        },
        use: [retry({ times, delay: 0 })],
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});

      // The budget is 1 initial + `times` retries. It either reaches its success attempt within
      // the budget, or exhausts the budget failing.
      const expected = Math.min(succeedAt, times + 1);
      expect(attempts, `seed ${seed} times ${times} succeedAt ${succeedAt}`).toBe(expected);
    }
  });
});
