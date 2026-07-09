import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, retry } from "../../lib/index";

describe("the retry when-predicate", () => {
  test("skips retrying when it returns false", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("nope");
      },
      use: [retry({ times: 5, delay: 0, when: () => false })],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(attempts).toBe(1);
  });

  test("receives each error at its 1-based attempt", async () => {
    const seen: Array<{ msg: string; attempt: number }> = [];
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error(`e${attempts}`);
      },
      use: [
        retry({
          times: 5,
          delay: 0,
          when: (error, attempt) => {
            seen.push({ msg: (error as Error).message, attempt });
            return attempt < 3; // stop retrying at attempt 3
          },
        }),
      ],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(seen).toEqual([
      { msg: "e1", attempt: 1 },
      { msg: "e2", attempt: 2 },
      { msg: "e3", attempt: 3 },
    ]);
    expect(attempts).toBe(3);
  });
});
