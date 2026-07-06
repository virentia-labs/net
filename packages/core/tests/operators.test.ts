import { reaction, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, debounce, fallback, query, retry, tap, timeout } from "../lib/index";
import { defer } from "./helpers";

describe("timeout", () => {
  test("rejects with a TimeoutError when the run is too slow", async () => {
    const gate = defer<string>();
    const q = query({
      handler: () => gate.promise,
      use: [timeout(10)],
    });

    const errors: unknown[] = [];
    reaction({ on: q.failData, run: (error) => void errors.push(error) });

    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});

    expect((errors[0] as Error).name).toBe("TimeoutError");
    expect(scoped(app, () => q.data.value)).toBeNull();
  });

  test("passes through when the run finishes in time", async () => {
    const q = query({ handler: async (id: string) => id, use: [timeout(1000)] });
    const app = scope();
    await scoped(app, () => q("ok"));
    expect(scoped(app, () => q.data.value)).toBe("ok");
  });
});

describe("fallback", () => {
  test("recovers a failed run with a static value", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("down");
      },
      use: [fallback("cached")],
    });

    const app = scope();
    await scoped(app, () => q(undefined));
    expect(scoped(app, () => q.data.value)).toBe("cached");
  });

  test("computes the fallback from the error and params", async () => {
    const q = query({
      handler: async (_id: string): Promise<string> => {
        throw new Error("boom");
      },
      use: [fallback((error, id) => `${id}:${(error as Error).message}`)],
    });

    const app = scope();
    await scoped(app, () => q("x"));
    expect(scoped(app, () => q.data.value)).toBe("x:boom");
  });

  test("catches only after retry is exhausted when placed before it", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("nope");
      },
      use: [fallback("fb"), retry({ times: 2, delay: 0 })],
    });

    const app = scope();
    await scoped(app, () => q(undefined));
    expect(attempts).toBe(3); // retried, then fell back
    expect(scoped(app, () => q.data.value)).toBe("fb");
  });
});

describe("debounce", () => {
  test("with takeLatest, only the last of a burst runs", async () => {
    const started: string[] = [];
    const q = query({
      handler: async (text: string) => {
        started.push(text);
        return text;
      },
      use: [concurrency({ strategy: "takeLatest" }), debounce({ wait: 20 })],
    });

    const app = scope();
    scoped(app, () => {
      // superseded runs reject with a skip; catch so they don't warn as unhandled
      q("a").catch(() => {});
      q("b").catch(() => {});
      void q("c");
    });

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(started).toEqual(["c"]); // a and b were aborted mid-wait
    expect(scoped(app, () => q.data.value)).toBe("c");
  });
});

describe("tap", () => {
  test("observes start/success without changing the result", async () => {
    const events: string[] = [];
    const q = query({
      handler: async (id: string) => `v:${id}`,
      use: [
        tap({
          onStart: (id) => events.push(`start:${id}`),
          onSuccess: (data) => events.push(`success:${data}`),
          onSettled: () => events.push("settled"),
        }),
      ],
    });

    const app = scope();
    await scoped(app, () => q("1"));

    expect(events).toEqual(["start:1", "success:v:1", "settled"]);
    expect(scoped(app, () => q.data.value)).toBe("v:1");
  });

  test("observes errors", async () => {
    const events: string[] = [];
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("bad");
      },
      use: [tap({ onError: (error) => events.push((error as Error).message) })],
    });

    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(events).toEqual(["bad"]);
  });
});
