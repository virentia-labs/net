import { reaction, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query, retry } from "../lib/index";

describe("retry", () => {
  test("retries a failing handler until it succeeds", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`attempt ${attempts}`);
        }
        return "ok";
      },
      use: [retry({ times: 3, delay: 0 })],
    });

    const app = scope();
    await scoped(app, () => q(undefined));

    expect(attempts).toBe(3);
    expect(scoped(app, () => q.data.value)).toBe("ok");
  });

  test("gives up after `times` retries and surfaces the last error", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error(`fail ${attempts}`);
      },
      use: [retry({ times: 2, delay: 0 })],
    });

    const errors: unknown[] = [];
    reaction({ on: q.failData, run: (error) => void errors.push(error) });

    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});

    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect((errors[0] as Error).message).toBe("fail 3");
  });

  test("`when` predicate can veto a retry", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("nope");
      },
      use: [retry({ times: 5, delay: 0, when: () => false })],
    });

    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});

    expect(attempts).toBe(1);
  });

  test("retry composes inside concurrency (concurrency is outer)", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("retry me");
        }
        return "done";
      },
      use: [concurrency({ strategy: "takeLatest" }), retry({ times: 3, delay: 0 })],
    });

    const app = scope();
    await scoped(app, () => q(undefined));

    expect(attempts).toBe(2);
    expect(scoped(app, () => q.data.value)).toBe("done");
  });
});
